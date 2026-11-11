import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getMetaAppSecret, getWebhookVerifyToken } from "../_shared/meta-env.ts";
import { verifyMetaSignature } from "../_shared/meta-signature.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toIsoFromWaTimestamp(ts?: string): string {
  const asNumber = ts ? Number(ts) : NaN;
  if (!Number.isFinite(asNumber) || asNumber <= 0) return new Date().toISOString();
  return new Date(asNumber * 1000).toISOString();
}

function createInboundClient(url: string, key: string) { return createClient(url, key); }
type InboundClient = ReturnType<typeof createInboundClient>;

async function pickWaNumberForSender(
  supabase: InboundClient,
  waNumbers: Array<{ id: string; tenant_id: string; created_at?: string }>,
  senderPhone: string,
  preferredTenantId?: string,
) {
  if (waNumbers.length === 1) return waNumbers[0];

  if (preferredTenantId) {
    const preferred = waNumbers.find((w) => w.tenant_id === preferredTenantId);
    if (preferred) return preferred;
  }

  const phoneCandidates = [senderPhone, `+${senderPhone}`];
  let bestCandidate: { id: string; tenant_id: string; created_at?: string } | null = null;
  let bestScore = -1;

  for (const candidate of waNumbers) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", candidate.tenant_id)
      .in("phone_e164", phoneCandidates)
      .limit(1)
      .maybeSingle();

    if (!contact) continue;

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, last_message_at")
      .eq("tenant_id", candidate.tenant_id)
      .eq("wa_number_id", candidate.id)
      .eq("contact_id", String((contact as { id: string }).id))
      .eq("status", "open")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    let score = 5; // contact match

    if (conversation) {
      score += 10; // conversation match

      const { data: outboundMessage } = await supabase
        .from("messages")
        .select("id")
        .eq("tenant_id", candidate.tenant_id)
        .eq("conversation_id", String((conversation as { id: string }).id))
        .eq("direction", "outbound")
        .limit(1)
        .maybeSingle();

      if (outboundMessage) {
        score += 100; // strongest signal: we have outbound history on this tenant/number/contact
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate || waNumbers[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET — Webhook verification challenge
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = getWebhookVerifyToken();

    if (!verifyToken) return new Response("Webhook verification not configured", { status: 503 });

    if (mode === "subscribe" && token === verifyToken && challenge !== null) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // POST — Receive events
  if (req.method === "POST") {
    const bodyText = await req.text();

    // Verify signature
    const signature = req.headers.get("X-Hub-Signature-256");
    const valid = await verifyMetaSignature(bodyText, signature, getMetaAppSecret());
    if (!valid) {
      console.warn("Invalid webhook signature for wa_webhook_inbound");
      return new Response("Invalid signature", { status: 403 });
    }

    const payload = JSON.parse(bodyText);
    const supabase = createInboundClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    try {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== "messages") continue;

          const value = change.value;
          const phoneNumberId = value.metadata?.phone_number_id;

          if (!phoneNumberId) {
            console.warn("Webhook event without metadata.phone_number_id");
            continue;
          }

          const { data: waNumbers, error: waNumErr } = await supabase
            .from("wa_numbers")
            .select("id, tenant_id, created_at")
            .eq("phone_number_id", phoneNumberId)
            .order("created_at", { ascending: false });

          if (waNumErr) {
            console.error("wa_numbers lookup error:", waNumErr);
            continue;
          }

          if (!waNumbers?.length) {
            console.warn(`Unknown phone_number_id: ${phoneNumberId}`);
            continue;
          }

          if (waNumbers.length > 1) {
            console.warn(
              `Multiple wa_numbers found for phone_number_id=${phoneNumberId}; resolving by conversation/sender` as string,
            );
          }

          const affectedTenants = new Set<string>();

          // Process status updates first, so we can infer the right tenant when phone_number_id is duplicated
          for (const status of value.statuses || []) {
            const statusMap: Record<string, string> = {
              sent: "sent",
              delivered: "delivered",
              read: "read",
              failed: "failed",
            };

            const mappedStatus = statusMap[status.status];
            if (!mappedStatus || !status.id) continue;

            const statusTimestamp = toIsoFromWaTimestamp(status.timestamp);
            const statusPatch: Record<string, string> = { status: mappedStatus };

            if (mappedStatus === "sent") statusPatch.sent_at = statusTimestamp;
            if (mappedStatus === "delivered") statusPatch.delivered_at = statusTimestamp;
            if (mappedStatus === "read") statusPatch.read_at = statusTimestamp;
            if (mappedStatus === "failed") statusPatch.failed_at = statusTimestamp;

            const { data: updatedRows, error: updateErr } = await supabase
              .from("messages")
              .update(statusPatch)
              .eq("provider_message_id", status.id)
              .in("tenant_id", waNumbers.map((n: { tenant_id: string }) => n.tenant_id))
              .select("tenant_id");

            if (updateErr) {
              console.error("Status update failed:", updateErr);
              continue;
            }

            for (const row of updatedRows || []) {
              if (row?.tenant_id && UUID_REGEX.test(row.tenant_id)) {
                affectedTenants.add(row.tenant_id);
              }
            }

            if ((!updatedRows || updatedRows.length === 0) && waNumbers.length === 1) {
              affectedTenants.add(waNumbers[0].tenant_id);
            }
          }

          const preferredTenantId =
            affectedTenants.size === 1 ? Array.from(affectedTenants)[0] : undefined;

          // Process inbound messages
          for (const msg of value.messages || []) {
            const senderPhone = msg.from;
            if (!senderPhone) continue;

            const selectedWaNumber = await pickWaNumberForSender(
              supabase,
              waNumbers,
              senderPhone,
              preferredTenantId,
            );

            const tenantId = selectedWaNumber.tenant_id;
            affectedTenants.add(tenantId);

            const contactProfile = value.contacts?.[0]?.profile?.name || senderPhone;

            // Idempotency for webhook retries
            if (msg.id) {
              const { data: existingInbound } = await supabase
                .from("messages")
                .select("id")
                .eq("provider_message_id", msg.id)
                .maybeSingle();

              if (existingInbound) {
                continue;
              }
            }

            // Upsert contact
            const { data: contact, error: contactErr } = await supabase
              .from("contacts")
              .upsert(
                {
                  tenant_id: tenantId,
                  phone_e164: `+${senderPhone}`,
                  display_name: contactProfile,
                  wa_id: senderPhone,
                },
                { onConflict: "tenant_id,phone_e164" },
              )
              .select("id")
              .single();

            if (contactErr || !contact) {
              console.error("Contact upsert failed:", contactErr);
              continue;
            }

            // Upsert/open conversation
            let { data: conversation } = await supabase
              .from("conversations")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("wa_number_id", selectedWaNumber.id)
              .eq("contact_id", contact.id)
              .eq("status", "open")
              .maybeSingle();

            if (!conversation) {
              const { data: newConv, error: convErr } = await supabase
                .from("conversations")
                .insert({
                  tenant_id: tenantId,
                  wa_number_id: selectedWaNumber.id,
                  contact_id: contact.id,
                  status: "open",
                })
                .select("id")
                .single();

              if (convErr) {
                console.error("Conversation insert failed:", convErr);
                continue;
              }

              conversation = newConv;
            }

            if (!conversation) continue;

            // Determine message content
            const msgText = msg.text?.body || null;
            const hasMedia = ["image", "video", "audio", "document", "sticker"].includes(msg.type);

            // Insert inbound message
            const { data: insertedMsg, error: msgErr } = await supabase
              .from("messages")
              .insert({
                tenant_id: tenantId,
                conversation_id: conversation.id,
                direction: "inbound",
                status: "delivered",
                text: msgText,
                provider_message_id: msg.id,
                meta: {
                  type: msg.type,
                  ...(hasMedia ? { media: msg[msg.type] } : {}),
                },
              })
              .select("id")
              .single();

            if (msgErr || !insertedMsg) {
              console.error("Inbound message insert failed:", msgErr);
              continue;
            }

            // If media, enqueue processing
            if (hasMedia) {
              const mediaInfo = msg[msg.type];

              await supabase.from("media_files").insert({
                tenant_id: tenantId,
                message_id: insertedMsg.id,
                kind: msg.type === "sticker" ? "sticker" : msg.type,
                mime: mediaInfo?.mime_type || null,
                storage_key: null,
              });

              await supabase.from("job_queue").insert({
                tenant_id: tenantId,
                job_type: "MEDIA_PROCESS",
                payload: {
                  tenant_id: tenantId,
                  message_id: insertedMsg.id,
                  media_id: mediaInfo?.id,
                  mime_type: mediaInfo?.mime_type,
                },
              });
            }
          }

          // Enqueue webhook deliveries to customer endpoints for affected tenants
          if (affectedTenants.size === 0 && waNumbers.length === 1) {
            affectedTenants.add(waNumbers[0].tenant_id);
          }

          for (const tenantId of affectedTenants) {
            const { data: endpoints } = await supabase
              .from("webhook_endpoints")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("is_enabled", true);

            for (const ep of endpoints || []) {
              await supabase.from("job_queue").insert({
                tenant_id: tenantId,
                job_type: "WEBHOOK_DELIVERY",
                payload: {
                  webhook_endpoint_id: ep.id,
                  event_type: "whatsapp.event",
                  payload: value,
                },
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Webhook processing error:", err);
    }

    // Trigger worker_dispatch to process queued jobs (fire-and-forget)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/worker_dispatch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }).catch((e) => console.error("worker_dispatch trigger failed:", e));
    } catch (triggerErr) {
      console.error("Failed to trigger worker_dispatch:", triggerErr);
    }

    // Always return 200 quickly
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
