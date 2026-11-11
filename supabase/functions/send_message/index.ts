import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mimeToWaType(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      tenant_id,
      conversation_id,
      text,
      template,
      media_url,
      media_mime,
      media_filename,
      caption,
    } = body;

    if (!tenant_id || !conversation_id) {
      return json({ error: "tenant_id and conversation_id are required" }, 400);
    }

    // Check role >= operator
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      return json({ error: "Forbidden: operator role required" }, 403);
    }

    // Get conversation + contact + wa_number
    const { data: conv } = await serviceClient
      .from("conversations")
      .select("id, contact_id, wa_number_id, contacts(phone_e164), wa_numbers(phone_number_id)")
      .eq("id", conversation_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (!conv) return json({ error: "Conversation not found" }, 404);

    const recipientPhone = (conv as any).contacts?.phone_e164?.replace("+", "");
    const phoneNumberId = (conv as any).wa_numbers?.phone_number_id;
    const waAccessToken = requireMetaAccessToken();
    const apiVersion = getMetaApiVersion();

    // Build WhatsApp API payload
    const waPayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: recipientPhone,
    };

    let messageText = text || null;

    if (template) {
      waPayload.type = "template";
      waPayload.template = template;
    } else if (media_url && media_mime) {
      // Media message
      const waType = mimeToWaType(media_mime);
      waPayload.type = waType;

      const mediaObj: Record<string, string> = { link: media_url };
      if (caption) mediaObj.caption = caption;
      if (waType === "document" && media_filename) mediaObj.filename = media_filename;

      waPayload[waType] = mediaObj;
      messageText = caption || `[${waType}]`;
    } else if (text) {
      waPayload.type = "text";
      waPayload.text = { body: text };
    } else {
      return json({ error: "text, template, or media_url is required" }, 400);
    }

    // Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(waPayload),
      },
    );

    const waResult = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp API error:", JSON.stringify(waResult));
      return json({ error: "Failed to send message", details: waResult.error }, 502);
    }

    const providerMessageId = waResult.messages?.[0]?.id;

    // Build meta
    const meta: Record<string, unknown> = {};
    if (template) meta.template = template;
    if (media_url) {
      meta.media = {
        url: media_url,
        mime: media_mime,
        filename: media_filename || null,
        type: media_mime ? mimeToWaType(media_mime) : null,
      };
    }

    // Insert outbound message
    const { data: message, error: msgErr } = await serviceClient
      .from("messages")
      .insert({
        tenant_id,
        conversation_id,
        direction: "outbound",
        status: "sent",
        text: messageText,
        provider_message_id: providerMessageId,
        meta,
      })
      .select("id")
      .single();

    if (msgErr) {
      console.error("Message insert error:", msgErr);
      return json({ error: "Message sent but failed to record" }, 500);
    }

    // Audit log
    await serviceClient.from("audit_logs").insert({
      tenant_id,
      user_id: user.id,
      action: "SEND_MESSAGE",
      entity: "messages",
      entity_id: message?.id,
      meta: { conversation_id, direction: "outbound", has_media: !!media_url },
    });

    return json({ success: true, message_id: message?.id, provider_message_id: providerMessageId });
  } catch (err) {
    console.error("send_message error:", err);
    return json({ error: err.message }, 500);
  }
});
