// WhatsApp Cloud API webhook: GET verification challenge + POST event processing.
// Inbound messages create contacts/conversations/messages; media is archived to MinIO.
import { adminClient, archiveMedia } from "../_shared/wa.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface WaMessage {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  image?: { id: string; mime_type: string; caption?: string };
  video?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
}

interface WaStatus {
  id: string;
  status: string;
  recipient_id?: string;
}

interface ChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

async function tokenForAccount(admin: ReturnType<typeof adminClient>, accountId: string): Promise<string | null> {
  const { data } = await admin.from("whatsapp_account_secrets").select("access_token").eq("account_id", accountId).maybeSingle();
  return data?.access_token ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? null;
}

async function handleInbound(value: ChangeValue) {
  const admin = adminClient();
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, user_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (!account) return; // number not registered in this app

  for (const msg of value.messages ?? []) {
    const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

    // Find or create the contact for this sender.
    let contactId: string | null = null;
    const { data: existingContact } = await admin
      .from("contacts")
      .select("id")
      .eq("user_id", account.user_id)
      .eq("phone", msg.from)
      .maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: created } = await admin
        .from("contacts")
        .insert({
          user_id: account.user_id,
          account_id: account.id,
          phone: msg.from,
          display_name: profileName,
          whatsapp_id: msg.from,
        })
        .select("id")
        .single();
      contactId = created?.id ?? null;
    }
    if (!contactId) continue;

    // Find or create the conversation.
    let convId: string | null = null;
    const { data: existingConv } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", account.user_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (existingConv) {
      convId = existingConv.id;
    } else {
      const { data: created } = await admin
        .from("conversations")
        .insert({ user_id: account.user_id, contact_id: contactId, account_id: account.id, status: "active" })
        .select("id")
        .single();
      convId = created?.id ?? null;
    }
    if (!convId) continue;

    const content = msg.text?.body ?? msg.image?.caption ?? msg.video?.caption ?? msg.document?.caption ?? null;
    const mediaPart = msg.image ?? msg.video ?? msg.audio ?? msg.document ?? msg.sticker;
    const mediaType = mediaPart
      ? msg.image ? "image" : msg.video ? "video" : msg.audio ? "audio" : msg.sticker ? "sticker" : "document"
      : null;

    const { data: inserted, error } = await admin
      .from("messages")
      .insert({
        user_id: account.user_id,
        conversation_id: convId,
        account_id: account.id,
        direction: "inbound",
        content,
        media_type: mediaType,
        status: "delivered",
        wa_message_id: msg.id,
      })
      .select("id")
      .single();
    if (error || !inserted) continue;

    // Archive media to MinIO when present.
    if (mediaPart && msg.type !== "sticker") {
      try {
        const token = await tokenForAccount(admin, account.id);
        if (token) {
          const stored = await archiveMedia({
            token,
            mediaId: mediaPart.id,
            userId: account.user_id,
            accountId: account.id,
            filenameHint: msg.document?.filename,
          });
          await admin.from("media_files").insert({
            user_id: account.user_id,
            account_id: account.id,
            contact_id: contactId,
            message_id: inserted.id,
            ...stored,
          });
          await admin.from("messages").update({ media_url: stored.storage_url }).eq("id", inserted.id);
        }
      } catch (e) {
        console.error("media archive failed", e);
      }
    }

    const now = new Date().toISOString();
    await admin
      .from("conversations")
      .update({ last_message_at: now, status: "active" })
      .eq("id", convId);
    // Increment unread atomically.
    await admin.rpc("increment_unread", { p_conversation_id: convId });
  }
}

async function handleStatus(value: ChangeValue) {
  const admin = adminClient();
  for (const s of value.statuses ?? []) {
    await admin.from("messages").update({ status: s.status }).eq("wa_message_id", s.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as { object?: string; entry?: { changes?: { value?: ChangeValue; field?: string }[] }[] };
    if (body.object !== "whatsapp_business_account") return json({ received: true });

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;
        if (value.messages?.length) await handleInbound(value);
        if (value.statuses?.length) await handleStatus(value);
      }
    }
    return json({ received: true });
  } catch (e) {
    console.error("webhook error", e);
    // Always 200 so Meta does not disable the webhook; errors are logged.
    return json({ received: true });
  }
});
