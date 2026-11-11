/**
 * whatsapp_webhook — Edge Function (Production-Ready)
 * ════════════════════════════════════════════════════
 * معالجة Meta Webhook — التحقق إلزامي؛ يلزم اختبار الاستمرارية قبل اعتماد الإنتاج:
 *   GET:  مطابقة VERIFY_TOKEN + إعادة challenge نصاً عادياً فقط + 200 OK فورًا
 *   POST: تحقق HMAC-SHA256 ثم جدولة معالجة الخلفية؛ الإقرار لا يضمن التخزين الدائم
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWebhookVerifyToken, getMetaAppSecret } from "../_shared/meta-env.ts";
import { verifyMetaSignature } from "../_shared/meta-signature.mjs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MetaWebhookEvent {
  object: string;
  entry: MetaEntry[];
}
interface MetaEntry {
  id: string;
  changes: MetaChange[];
}
interface MetaChange {
  value: MetaChangeValue;
  field: string;
}
interface MetaChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}
interface MetaContact {
  profile: { name: string };
  wa_id: string;
}
interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "interactive"
    | "button"
    | "reaction"
    | "unsupported";
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256?: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { payload: string; text: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
}
interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; origin?: { type: string } };
  errors?: Array<{ code: number; title: string; message: string }>;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function makeSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// ─── HMAC-SHA256 Signature Verification ──────────────────────────────────────

// ─── Deduplication ────────────────────────────────────────────────────────────

async function isDuplicate(
  supabase: ReturnType<typeof makeSupabase>,
  msgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("provider_message_id", msgId)
    .maybeSingle();
  return !!data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return "+" + raw.replace(/\D/g, "");
}

function extractText(msg: MetaMessage): string | null {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? null;
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
    case "button":
      return msg.button?.text ?? null;
    case "image":
      return msg.image?.caption ?? "[صورة]";
    case "video":
      return msg.video?.caption ?? "[فيديو]";
    case "document":
      return msg.document?.caption ?? msg.document?.filename ?? "[مستند]";
    case "audio":
      return msg.audio?.voice ? "[رسالة صوتية]" : "[ملف صوتي]";
    case "sticker":
      return "[ملصق]";
    case "reaction":
      return msg.reaction?.emoji ?? null;
    case "location":
      return msg.location
        ? `📍 ${msg.location.name ?? "موقع"}: ${msg.location.latitude}, ${msg.location.longitude}`
        : null;
    default:
      return "[رسالة غير مدعومة]";
  }
}

function extractMediaId(msg: MetaMessage): string | null {
  return (
    msg.image?.id ?? msg.audio?.id ?? msg.video?.id ?? msg.document?.id ?? msg.sticker?.id ?? null
  );
}

function extractMimeType(msg: MetaMessage): string | null {
  return (
    msg.image?.mime_type ??
    msg.audio?.mime_type ??
    msg.video?.mime_type ??
    msg.document?.mime_type ??
    msg.sticker?.mime_type ??
    null
  );
}

// ─── Background Event Processor ──────────────────────────────────────────────

async function processEvent(event: MetaWebhookEvent): Promise<void> {
  if (event.object !== "whatsapp_business_account") return;
  const supabase = makeSupabase();

  for (const entry of event.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        console.log(`ℹ️  Unhandled field: ${change.field}`);
        continue;
      }
      const val = change.value;
      const phoneNumberId = val.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Resolve receiving-number ownership before modifying any message status.
      const { data: candidateNumbers, error: ownershipError } = await supabase
        .from("wa_numbers")
        .select("tenant_id")
        .eq("phone_number_id", phoneNumberId);
      if (ownershipError || !candidateNumbers?.length) {
        console.warn("Webhook ignored: unknown or inaccessible phone_number_id", phoneNumberId);
        continue;
      }
      const tenantIds = [...new Set(candidateNumbers.map((n) => n.tenant_id))];

      for (const status of val.statuses ?? []) {
        try {
          await handleStatus(supabase, status, tenantIds);
        } catch (e) {
          console.error("❌ handleStatus:", e);
        }
      }
      for (const msg of val.messages ?? []) {
        try {
          const contact = val.contacts?.find((c) => c.wa_id === msg.from);
          await handleIncoming(supabase, msg, contact, phoneNumberId);
        } catch (e) {
          console.error(`❌ handleIncoming [${msg.id}]:`, e);
        }
      }
    }
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ══════════════════════════════════════════
  // GET — التحقق الأولي من Meta
  // ══════════════════════════════════════════
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = getWebhookVerifyToken();
    if (!verifyToken) {
      console.error("❌ WHATSAPP_VERIFY_TOKEN is not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    if (mode === "subscribe" && token === verifyToken && challenge) {
      console.log("✅ Webhook verified successfully");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" }, // ← plain text فقط
      });
    }

    console.warn("⚠️  Webhook verification failed — token mismatch or missing params");
    return new Response("Forbidden", { status: 403 });
  }

  // ══════════════════════════════════════════
  // POST — استقبال الأحداث الفعلية
  // ══════════════════════════════════════════
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // قراءة الـ body للتحقق من التوقيع
  let rawBody: ArrayBuffer;
  let event: MetaWebhookEvent;
  try {
    rawBody = await req.arrayBuffer();
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("Bad Request: Invalid JSON", { status: 400 });
  }

  // التحقق من التوقيع قبل أي معالجة
  const valid = await verifyMetaSignature(rawBody, req.headers.get("X-Hub-Signature-256"), getMetaAppSecret());
  if (!valid) {
    console.error("❌ Invalid Meta signature — rejected");
    return new Response("Forbidden: Invalid signature", { status: 403 });
  }

  // ←←← 200 OK فوراً — أهم خطوة لمنع Timeout من Meta ←←←
  // المعالجة الفعلية تحدث في الخلفية
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(processEvent(event));
  } else {
    processEvent(event).catch((e) => console.error("❌ Background error:", e));
  }

  return new Response("OK", { status: 200 });
});

// ─── handleStatus ─────────────────────────────────────────────────────────────

async function handleStatus(
  supabase: ReturnType<typeof makeSupabase>,
  status: MetaStatus,
  tenantIds: string[],
) {
  if (tenantIds.length === 0) return;
  const validStatuses = ["sent", "delivered", "read", "failed"];
  if (!validStatuses.includes(status.status)) return;

  const update: Record<string, unknown> = { status: status.status };
  if (status.errors?.length) update.error_payload = status.errors;
  if (status.conversation?.id) update.wa_conversation_id = status.conversation.id;

  const { error } = await supabase
    .from("messages")
    .update(update)
    .eq("provider_message_id", status.id)
    .in("tenant_id", tenantIds);

  if (error) console.error("❌ Status update:", error.message);
  else console.log(`📬 ${status.id} → ${status.status}`);
}

// ─── handleIncoming ───────────────────────────────────────────────────────────

async function handleIncoming(
  supabase: ReturnType<typeof makeSupabase>,
  msg: MetaMessage,
  contact: MetaContact | undefined,
  phoneNumberId: string,
) {
  // 0. Deduplication
  if (await isDuplicate(supabase, msg.id)) {
    console.log(`⚠️  Duplicate skipped: ${msg.id}`);
    return;
  }

  const fromPhone = normalizePhone(msg.from);
  const contactName = contact?.profile?.name ?? null;

  // 1. رقم الواتساب
  const { data: waNum, error: numErr } = await supabase
    .from("wa_numbers")
    .select("id, tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .single();

  if (numErr || !waNum) {
    console.error("❌ WA number not found:", phoneNumberId, numErr?.message);
    return;
  }
  const { id: waNumberId, tenant_id: tenantId } = waNum;

  // 2. جهة الاتصال
  let contactId: string;
  {
    const { data: ex } = await supabase
      .from("contacts")
      .select("id, display_name")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", fromPhone)
      .maybeSingle();
    if (ex) {
      contactId = ex.id;
      if (contactName && contactName !== ex.display_name)
        await supabase.from("contacts").update({ display_name: contactName }).eq("id", ex.id);
    } else {
      const { data: nc, error: ce } = await supabase
        .from("contacts")
        .insert({ tenant_id: tenantId, phone_e164: fromPhone, display_name: contactName })
        .select("id")
        .single();
      if (ce || !nc) {
        console.error("❌ Contact:", ce?.message);
        return;
      }
      contactId = nc.id;
    }
  }

  // 3. المحادثة
  let convId: string;
  {
    const { data: ex } = await supabase
      .from("conversations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .eq("wa_number_id", waNumberId)
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ex) {
      convId = ex.id;
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convId);
    } else {
      const { data: nc, error: ce } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          wa_number_id: waNumberId,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (ce || !nc) {
        console.error("❌ Conversation:", ce?.message);
        return;
      }
      convId = nc.id;
    }
  }

  // 4. حفظ الرسالة
  const text = extractText(msg);
  const mediaWaId = extractMediaId(msg);
  const mediaMime = extractMimeType(msg);

  const { data: saved, error: me } = await supabase
    .from("messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: convId,
      direction: "inbound",
      status: "delivered",
      provider_message_id: msg.id,
      type: msg.type,
      text,
      media_wa_id: mediaWaId,
      media_mime: mediaMime,
      media_filename: msg.document?.filename ?? null,
      interactive_payload: msg.interactive ?? msg.button ?? null,
      raw_payload: msg,
      timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (me) {
    if (me.code === "23505") {
      console.log(`⚠️  Race dedup: ${msg.id}`);
      return;
    }
    console.error("❌ Message insert:", me.message);
    return;
  }
  console.log(`✅ ${saved?.id} | conv:${convId} | from:${fromPhone} | ${msg.type}`);

  // 5. Chatbot
  if (Deno.env.get("CHATBOT_ENABLED") === "true" && saved?.id) {
    await callFunction("chatbot_engine", {
      tenantId,
      convId,
      messageId: saved.id,
      waNumberId,
      phoneNumberId,
      fromPhone,
      msgType: msg.type,
      text,
      mediaWaId,
    });
  }

  // 6. AI Vision
  if (
    Deno.env.get("AI_VISION_ENABLED") === "true" &&
    mediaWaId &&
    saved?.id &&
    ["image", "document"].includes(msg.type)
  ) {
    await callFunction("ai_vision", {
      tenantId,
      messageId: saved.id,
      mediaWaId,
      mediaType: msg.type,
    });
  }
}

// ─── callFunction ─────────────────────────────────────────────────────────────

async function callFunction(name: string, payload: unknown): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const r = await fetch(`${base}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`❌ ${name} → ${r.status}:`, await r.text());
  } catch (e) {
    console.error(`❌ ${name} call failed:`, e);
  }
}
