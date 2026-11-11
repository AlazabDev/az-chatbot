// Meta WhatsApp Cloud webhook receiver.
// Public endpoint: verifies Meta HMAC, persists idempotently, and queues finance media.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertPublicWebhookUrl } from "../_shared/ssrf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function background(promise: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise.catch((e) => console.error("background task failed", e));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(rawBody: string, signature: string | null) {
  if (!APP_SECRET || !signature?.startsWith("sha256=")) return false;
  const provided = signature.slice("sha256=".length).toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return constantTimeEqual(expected, provided);
}

async function findTenantByPhoneNumberId(phoneNumberId: string) {
  const { data, error } = await admin
    .from("wa_numbers")
    .select("id,tenant_id,phone_e164,display_phone_number,meta")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertContact(tenantId: string, waId: string, name?: string) {
  const phone = waId.startsWith("+") ? waId : `+${waId}`;
  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: phone, wa_id: waId, display_name: name ?? phone })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function getOrCreateConversation(tenantId: string, waNumberId: string, contactId: string) {
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("wa_number_id", waNumberId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      wa_number_id: waNumberId,
      contact_id: contactId,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function getOrCreateFinanceBatch(tenantId: string) {
  const date = new Date().toISOString().slice(0, 10);
  const name = `WhatsApp Finance ${date}`;
  const { data: existing } = await admin
    .from("finance_batches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .in("status", ["open", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("finance_batches")
    .insert({ tenant_id: tenantId, name, status: "open" })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function queueFinanceDocument(args: {
  tenantId: string;
  waNumberId: string;
  messageId: string;
  fromPhone: string;
  mediaId: string;
  mime: string | null;
  fileName: string | null;
}) {
  const batchId = await getOrCreateFinanceBatch(args.tenantId);
  const { error } = await admin.from("finance_documents").upsert(
    {
      tenant_id: args.tenantId,
      batch_id: batchId,
      wa_number_id: args.waNumberId,
      message_id: args.messageId,
      from_phone: args.fromPhone,
      media_wa_id: args.mediaId,
      file_name: args.fileName,
      mime: args.mime,
      status: "pending",
    },
    { onConflict: "tenant_id,media_wa_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  await admin.from("finance_batches").update({ status: "processing" }).eq("id", batchId);
}

async function dispatchToTargets(
  tenantId: string,
  eventType: string,
  payload: unknown,
  waNumberId: string,
) {
  const { data: targets } = await admin
    .from("hub_dispatch_targets")
    .select("id,url,secret,events_filter,numbers_filter,timeout_ms")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (!targets?.length) return;

  for (const t of targets) {
    const events = (t.events_filter as string[]) ?? [];
    const numbers = (t.numbers_filter as string[]) ?? [];
    if (events.length && !events.includes(eventType)) continue;
    if (numbers.length && !numbers.includes(waNumberId)) continue;

    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (t.secret) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(t.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
      headers["X-Webhook-Signature"] =
        "sha256=" +
        Array.from(new Uint8Array(mac))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
    }

    const startedAt = Date.now();

    // SSRF guard: re-validate the tenant-supplied URL on every dispatch.
    const check = await assertPublicWebhookUrl(t.url);
    if (!check.ok) {
      const message = `blocked webhook target (${check.reason})`;
      await admin.from("hub_deliveries").insert({
        tenant_id: tenantId,
        target_id: t.id,
        status: "failed",
        error_message: message,
        response_time_ms: Date.now() - startedAt,
      });
      await admin.from("hub_dispatch_targets").update({ last_error: message }).eq("id", t.id);
      continue;
    }

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), t.timeout_ms ?? 5000);
      const resp = await fetch(t.url, {
        method: "POST",
        headers,
        body,
        signal: ctl.signal,
        redirect: "manual",
      });
      clearTimeout(timer);

      await admin.from("hub_deliveries").insert({
        tenant_id: tenantId,
        target_id: t.id,
        event_id: null,
        status: resp.ok ? "delivered" : "failed",
        http_status: resp.status,
        response_time_ms: Date.now() - startedAt,
        delivered_at: new Date().toISOString(),
      });
      await admin
        .from("hub_dispatch_targets")
        .update({
          last_delivery_at: new Date().toISOString(),
          last_error: resp.ok ? null : `HTTP ${resp.status}`,
        })
        .eq("id", t.id);
    } catch (e) {
      await admin.from("hub_deliveries").insert({
        tenant_id: tenantId,
        target_id: t.id,
        status: "failed",
        error_message: (e as Error).message,
        response_time_ms: Date.now() - startedAt,
      });
      await admin
        .from("hub_dispatch_targets")
        .update({ last_error: (e as Error).message })
        .eq("id", t.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!VERIFY_TOKEN) return new Response("Webhook verify token not configured", { status: 503 });
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN)
      return new Response(challenge ?? "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!APP_SECRET) return new Response("Webhook app secret not configured", { status: 503 });

  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const meta = value.metadata ?? {};
      const phoneNumberId = meta.phone_number_id;
      if (!phoneNumberId) continue;

      const waNum = await findTenantByPhoneNumberId(phoneNumberId);
      if (!waNum) {
        await admin.from("hub_events").insert({
          phone_number_id: phoneNumberId,
          event_type: "unmapped",
          payload: value,
          processed: false,
        });
        continue;
      }
      const tenantId = waNum.tenant_id;

      for (const status of value.statuses ?? []) {
        const wamId = status.id;
        const ts = new Date(parseInt(status.timestamp) * 1000).toISOString();
        const updates: Record<string, unknown> = {};
        if (status.status === "sent") {
          updates.sent_at = ts;
          updates.status = "sent";
        }
        if (status.status === "delivered") {
          updates.delivered_at = ts;
          updates.status = "delivered";
        }
        if (status.status === "read") {
          updates.read_at = ts;
          updates.status = "read";
        }
        if (status.status === "failed") {
          updates.failed_at = ts;
          updates.status = "failed";
          updates.error_payload = status.errors ?? null;
        }
        if (Object.keys(updates).length)
          await admin.from("messages").update(updates).eq("provider_message_id", wamId);

        const eventType = `message.${status.status}`;
        await admin.from("hub_events").insert({
          tenant_id: tenantId,
          phone_number_id: phoneNumberId,
          event_type: eventType,
          direction: "outbound",
          wam_id: wamId,
          payload: status,
          processed: true,
          processed_at: new Date().toISOString(),
        });
        background(dispatchToTargets(tenantId, eventType, status, waNum.id));
      }

      const contactsMeta = value.contacts ?? [];
      for (const msg of value.messages ?? []) {
        const fromWaId = msg.from;
        const existing = await admin
          .from("messages")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("provider_message_id", msg.id)
          .maybeSingle();
        if (existing.data) continue;

        const profileName = contactsMeta.find((c: any) => c.wa_id === fromWaId)?.profile?.name;
        const contactId = await upsertContact(tenantId, fromWaId, profileName);
        const conversationId = await getOrCreateConversation(tenantId, waNum.id, contactId);
        const text =
          msg.text?.body ??
          msg.button?.text ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          null;
        const mediaId = msg.image?.id ?? msg.video?.id ?? msg.audio?.id ?? msg.document?.id ?? null;
        const mediaMime =
          msg.image?.mime_type ??
          msg.video?.mime_type ??
          msg.audio?.mime_type ??
          msg.document?.mime_type ??
          null;
        const mediaFilename = msg.document?.filename ?? null;

        const { data: inserted, error: insertError } = await admin
          .from("messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            direction: "inbound",
            status: "delivered",
            type: msg.type ?? "text",
            text,
            provider_message_id: msg.id,
            chat_id: fromWaId,
            timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            delivered_at: new Date().toISOString(),
            is_received: true,
            interactive_payload: msg.interactive ?? null,
            media_wa_id: mediaId,
            media_mime: mediaMime,
            media_filename: mediaFilename,
            raw_payload: msg,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        await admin
          .from("contacts")
          .update({ last_message_received_at: new Date().toISOString() })
          .eq("id", contactId);
        await admin.from("hub_events").insert({
          tenant_id: tenantId,
          phone_number_id: phoneNumberId,
          event_type: "message.received",
          direction: "inbound",
          wam_id: msg.id,
          from_phone: fromWaId,
          to_phone: meta.display_phone_number,
          payload: msg,
          processed: true,
          processed_at: new Date().toISOString(),
        });

        const isFinance = (waNum.meta as any)?.purpose === "finance";
        if (isFinance && mediaId && ["image", "document"].includes(msg.type)) {
          await queueFinanceDocument({
            tenantId,
            waNumberId: waNum.id,
            messageId: inserted.id,
            fromPhone: fromWaId,
            mediaId,
            mime: mediaMime,
            fileName: mediaFilename,
          });
        }

        background(
          dispatchToTargets(
            tenantId,
            "message.received",
            {
              message: msg,
              contact: { wa_id: fromWaId, name: profileName },
            },
            waNum.id,
          ),
        );
      }
    }
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
