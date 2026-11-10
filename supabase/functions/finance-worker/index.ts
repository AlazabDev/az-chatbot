// Finance media worker: tenant/batch scoped, bounded, idempotent, and service-aware.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { minioGet, minioPut, minioConfigured, MINIO_BUCKET } from "../_shared/minio.ts";
import { analyzeImage, visionConfigured } from "../_shared/vision.ts";
import { extractFinanceData } from "../_shared/foundry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_VERSION = Deno.env.get("WA_API_VERSION") ?? "v21.0";
const PREFIX = Deno.env.get("FINANCE_STORAGE_PREFIX") ?? "finance";
const PIPELINE_ENABLED = (Deno.env.get("FINANCE_PIPELINE_ENABLED") ?? "true") !== "false";
const WORKER_ID = "finance-media-worker";
const LEASE_SECONDS = 300;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveWaToken(waNumberId?: string | null) {
  if (waNumberId) {
    const { data } = await admin
      .from("wa_numbers")
      .select("meta")
      .eq("id", waNumberId)
      .maybeSingle();
    const secretName = (data?.meta as any)?.token_secret as string | undefined;
    if (secretName) {
      const scoped = Deno.env.get(secretName);
      if (scoped) return scoped;
    }
  }
  return Deno.env.get("WA_FINANCE_TOKEN") ?? Deno.env.get("WA_ACCESS_TOKEN") ?? "";
}

async function downloadWaMedia(
  mediaId: string,
  waNumberId?: string | null,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const token = await resolveWaToken(waNumberId);
  if (!token) throw new Error("WhatsApp finance token not configured");
  const metaRes = await fetch(`https://graph.facebook.com/${WA_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`WA media meta ${metaRes.status}`);
  const meta = await metaRes.json();
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) throw new Error(`WA media download ${fileRes.status}`);
  return {
    bytes: new Uint8Array(await fileRes.arrayBuffer()),
    mime: meta.mime_type ?? "image/jpeg",
  };
}

async function authorize(req: Request, tenantId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;
  if (token === SERVICE_KEY) return true;
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (!userId) return false;
  const { data: membership } = await admin
    .from("tenant_members")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(membership && ["operator", "admin"].includes(String(membership.role)));
}

async function rollupBatch(tenantId: string, batchId: string) {
  const [{ count: total }, { count: done }, { count: failedCount }] = await Promise.all([
    admin
      .from("finance_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("batch_id", batchId),
    admin
      .from("finance_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("batch_id", batchId)
      .eq("status", "done"),
    admin
      .from("finance_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("batch_id", batchId)
      .eq("status", "failed"),
  ]);
  const { data: sums } = await admin
    .from("finance_documents")
    .select("total_amount,currency")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId)
    .eq("status", "done");

  const grouped = new Map<string, { total: number; count: number }>();
  for (const row of sums ?? []) {
    const currency = String(row.currency ?? "UNKNOWN").toUpperCase();
    const current = grouped.get(currency) ?? { total: 0, count: 0 };
    current.total += Number(row.total_amount) || 0;
    current.count += 1;
    grouped.set(currency, current);
  }

  await admin
    .from("finance_batch_currency_totals")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId);
  if (grouped.size) {
    await admin.from("finance_batch_currency_totals").insert(
      [...grouped.entries()].map(([currency, value]) => ({
        batch_id: batchId,
        tenant_id: tenantId,
        currency,
        total_amount: value.total,
        document_count: value.count,
      })),
    );
  }

  const oneCurrency = grouped.size === 1 ? [...grouped.entries()][0] : null;
  await admin
    .from("finance_batches")
    .update({
      total_documents: total ?? 0,
      processed_documents: done ?? 0,
      failed_documents: failedCount ?? 0,
      total_amount: oneCurrency?.[1].total ?? 0,
      currency: oneCurrency?.[0] === "UNKNOWN" ? null : (oneCurrency?.[0] ?? null),
      status:
        (done ?? 0) + (failedCount ?? 0) >= (total ?? 0) && (total ?? 0) > 0
          ? "completed"
          : "processing",
    })
    .eq("tenant_id", tenantId)
    .eq("id", batchId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenant_id ?? "");
  const batchId = body.batch_id ? String(body.batch_id) : null;
  const resume = body.resume === true;
  const limit = Math.min(Math.max(Number(body.limit ?? 3), 1), 5);
  if (!tenantId) return json({ error: "tenant_id is required" }, 400);
  if (!(await authorize(req, tenantId))) return json({ error: "Forbidden" }, 403);

  if (batchId) {
    const { data: batch } = await admin
      .from("finance_batches")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", batchId)
      .maybeSingle();
    if (!batch) return json({ error: "Batch does not belong to tenant" }, 403);
  }

  if (!PIPELINE_ENABLED) return json({ skipped: true, reason: "FINANCE_PIPELINE_ENABLED=false" });
  if (!minioConfigured()) return json({ error: "MinIO (Milano) not configured" }, 500);
  if (!visionConfigured()) return json({ error: "Azure Vision not configured" }, 500);

  const { data: state } = await admin
    .from("finance_worker_state")
    .select("*")
    .eq("id", WORKER_ID)
    .maybeSingle();
  if (resume && state?.is_paused)
    await admin
      .from("finance_worker_state")
      .update({ is_paused: false, paused_reason: null })
      .eq("id", WORKER_ID);
  const probeOnly = Boolean(state?.is_paused && !resume);

  const now = Date.now();
  if (state?.lease_until && new Date(state.lease_until).getTime() > now) {
    return json({
      skipped: true,
      reason: "another run in progress",
      lease_until: state.lease_until,
    });
  }
  const leaseUntil = new Date(now + LEASE_SECONDS * 1000).toISOString();
  const { data: leased } = await admin
    .from("finance_worker_state")
    .update({ lease_until: leaseUntil, last_run_at: new Date().toISOString() })
    .eq("id", WORKER_ID)
    .or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
    .select("id")
    .maybeSingle();
  if (!leased) return json({ skipped: true, reason: "lease not acquired" });

  const results: any[] = [];
  let paused: string | null = null;
  let rateLimited = 0;

  try {
    const { data: docs, error } = await admin.rpc("claim_finance_documents_scoped", {
      _tenant_id: tenantId,
      _batch_id: batchId,
      _limit: probeOnly ? 1 : limit,
      _lease_seconds: LEASE_SECONDS,
    });
    if (error) throw new Error(error.message);

    for (const doc of docs ?? []) {
      try {
        let bytes: Uint8Array;
        let mime = doc.mime ?? "image/jpeg";
        let objectKey = doc.object_key as string | null;
        if (objectKey) {
          bytes = await minioGet(objectKey);
        } else if (doc.media_wa_id) {
          const dl = await downloadWaMedia(doc.media_wa_id, doc.wa_number_id);
          bytes = dl.bytes;
          mime = dl.mime;
          if (!mime.toLowerCase().startsWith("image/"))
            throw new Error(`Unsupported finance media type: ${mime}`);
          const hash = await sha256Hex(bytes);
          const ext = (mime.split("/")[1] ?? "jpg").split(";")[0];
          objectKey = `${PREFIX}/${doc.tenant_id}/${hash}.${ext}`;
          await minioPut(objectKey, bytes, mime);
          await admin
            .from("finance_documents")
            .update({
              object_key: objectKey,
              storage_bucket: MINIO_BUCKET,
              mime,
              size_bytes: bytes.length,
              sha256: hash,
            })
            .eq("tenant_id", tenantId)
            .eq("id", doc.id);
        } else {
          throw new Error("لا يوجد ملف مرتبط بالمستند");
        }
        if (!mime.toLowerCase().startsWith("image/"))
          throw new Error(`Unsupported finance media type: ${mime}`);

        const vision = await analyzeImage(bytes, mime);
        if (!vision.ocrText.trim()) throw new Error("Azure Vision returned empty OCR text");
        const extraction = await extractFinanceData(vision.ocrText, vision.tags);

        await admin
          .from("finance_documents")
          .update({
            status: "done",
            ocr_text: vision.ocrText,
            vision_result: { caption: vision.caption, tags: vision.tags },
            agent_result: extraction as any,
            doc_type: extraction.doc_type,
            vendor: extraction.vendor,
            invoice_number: extraction.invoice_number,
            invoice_date: extraction.invoice_date,
            currency: extraction.currency,
            total_amount: extraction.total_amount,
            tax_amount: extraction.tax_amount,
            confidence: extraction.confidence,
            error_message: null,
            processed_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("id", doc.id);

        results.push({ id: doc.id, status: "done", provider: extraction.provider });
        if (probeOnly)
          await admin
            .from("finance_worker_state")
            .update({ is_paused: false, paused_reason: null })
            .eq("id", WORKER_ID);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const status =
          (e as any).status ??
          (msg.match(/\b(402|403|429)\b/)?.[1] ? Number(msg.match(/\b(402|403|429)\b/)![1]) : 0);
        if (status === 402 || status === 403) paused = msg;
        if (status === 429) rateLimited++;
        await admin
          .from("finance_documents")
          .update({
            status: doc.attempts >= 3 ? "failed" : "pending",
            error_message: msg.slice(0, 500),
          })
          .eq("tenant_id", tenantId)
          .eq("id", doc.id);
        results.push({ id: doc.id, status: "error", error: msg.slice(0, 200) });
        if (paused) break;
      }
    }

    const batchIds = [...new Set((docs ?? []).map((d: any) => d.batch_id).filter(Boolean))];
    for (const id of batchIds) await rollupBatch(tenantId, id as string);

    if (paused || rateLimited >= 3) {
      await admin
        .from("finance_worker_state")
        .update({
          is_paused: true,
          paused_reason: paused ?? "Repeated rate limiting; retry later",
        })
        .eq("id", WORKER_ID);
    }

    const remainingQuery = admin
      .from("finance_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");
    if (batchId) remainingQuery.eq("batch_id", batchId);
    const { count: remaining } = await remainingQuery;

    await admin
      .from("finance_worker_state")
      .update({
        processed_total:
          (state?.processed_total ?? 0) + results.filter((r) => r.status === "done").length,
        last_error: null,
      })
      .eq("id", WORKER_ID);

    return json({
      success: true,
      tenant_id: tenantId,
      batch_id: batchId,
      processed: results.length,
      remaining: remaining ?? 0,
      paused: Boolean(paused) || rateLimited >= 3,
      paused_reason: paused,
      results,
    });
  } catch (e) {
    await admin
      .from("finance_worker_state")
      .update({ last_error: (e as Error).message })
      .eq("id", WORKER_ID);
    return json({ error: (e as Error).message }, 500);
  } finally {
    await admin.from("finance_worker_state").update({ lease_until: null }).eq("id", WORKER_ID);
  }
});
