// Send WhatsApp messages via Meta Cloud API with tenant-aware authorization.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_WA_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") ?? Deno.env.get("WA_TOKEN") ?? "";
const WA_VERSION = Deno.env.get("WA_API_VERSION") ?? "v21.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { wa_number_id, to, type = "text", text, template, media, reaction, context } = body;
  if (!wa_number_id || !to) return json({ error: "wa_number_id and to required" }, 400);

  const { data: num } = await admin
    .from("wa_numbers")
    .select("id,phone_number_id,tenant_id,meta")
    .eq("id", wa_number_id)
    .maybeSingle();
  if (!num) return json({ error: "Number not found" }, 404);

  const { data: member } = await admin
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", num.tenant_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || !["operator", "admin"].includes(String(member.role)))
    return json({ error: "Forbidden" }, 403);

  const tokenSecretName = (num.meta as any)?.token_secret as string | undefined;
  const waToken = (tokenSecretName ? Deno.env.get(tokenSecretName) : "") || DEFAULT_WA_TOKEN;
  if (!waToken) return json({ error: "WhatsApp token not configured for this number" }, 503);

  const toPhone = String(to).replace(/[^0-9]/g, "");
  if (!/^\d{8,15}$/.test(toPhone)) return json({ error: "Invalid destination phone" }, 400);
  const waPayload: any = { messaging_product: "whatsapp", to: toPhone, type };

  if (type === "text") {
    const value = String(text ?? "").trim();
    if (!value) return json({ error: "Text is required" }, 400);
    waPayload.text = { body: value, preview_url: true };
  } else if (type === "template") {
    if (!template?.name || !template?.language?.code)
      return json({ error: "Template name and language are required" }, 400);
    waPayload.template = template;
  } else if (type === "reaction") {
    if (!reaction?.message_id) return json({ error: "Reaction message_id required" }, 400);
    waPayload.reaction = { message_id: reaction.message_id, emoji: reaction?.emoji ?? "" };
  } else if (MEDIA_TYPES.has(type)) {
    if (!media?.link || !/^https:\/\//i.test(media.link))
      return json({ error: "HTTPS media link required" }, 400);
    const m: any = { link: media.link };
    if (media.caption && type !== "audio" && type !== "sticker") m.caption = media.caption;
    if (type === "document" && media.filename) m.filename = media.filename;
    waPayload[type] = m;
  } else {
    return json({ error: "Unsupported type" }, 400);
  }
  if (context?.message_id) waPayload.context = { message_id: context.message_id };

  const waResp = await fetch(
    `https://graph.facebook.com/${WA_VERSION}/${num.phone_number_id}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(waPayload),
    },
  );
  const waJson = await waResp.json().catch(() => ({}));
  if (!waResp.ok) return json({ error: "WA API error", details: waJson }, waResp.status);

  const phoneE164 = "+" + toPhone;
  let { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("tenant_id", num.tenant_id)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (!contact) {
    const ins = await admin
      .from("contacts")
      .insert({
        tenant_id: num.tenant_id,
        phone_e164: phoneE164,
        wa_id: toPhone,
        display_name: phoneE164,
      })
      .select("id")
      .single();
    if (ins.error) return json({ error: ins.error.message }, 500);
    contact = ins.data;
  }

  let { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("tenant_id", num.tenant_id)
    .eq("wa_number_id", num.id)
    .eq("contact_id", contact.id)
    .maybeSingle();
  if (!conv) {
    const ins = await admin
      .from("conversations")
      .insert({
        tenant_id: num.tenant_id,
        wa_number_id: num.id,
        contact_id: contact.id,
        status: "open",
      })
      .select("id")
      .single();
    if (ins.error) return json({ error: ins.error.message }, 500);
    conv = ins.data;
  }

  const wamId = waJson.messages?.[0]?.id;
  const textValue =
    type === "text"
      ? String(text ?? "")
      : type === "reaction"
        ? (reaction?.emoji ?? "")
        : (media?.caption ?? null);
  const { error: insertError } = await admin.from("messages").insert({
    tenant_id: num.tenant_id,
    conversation_id: conv.id,
    direction: "outbound",
    status: "sent",
    type,
    text: textValue,
    provider_message_id: wamId,
    chat_id: toPhone,
    timestamp: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    media_filename: media?.filename ?? null,
    raw_payload: waPayload,
  });
  if (insertError) console.error("Failed to persist outbound message", insertError.message);

  return json({ success: true, message_id: wamId });
});
