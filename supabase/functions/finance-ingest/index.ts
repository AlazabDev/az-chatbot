// Ingest finance images into Milano (MinIO) and queue them for processing.
// Requires authenticated operator/admin and an explicit tenant_id.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { minioPut, minioConfigured, MINIO_BUCKET } from "../_shared/minio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREFIX = Deno.env.get("FINANCE_STORAGE_PREFIX") ?? "finance";
const FINANCE_PHONE_ID = Deno.env.get("WA_FINANCE_PHONE_NUMBER_ID") ?? "";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64ToBytes(b64: string) {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array) {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims?.claims?.sub;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const tenantId = String(body.tenant_id ?? "");
  if (!tenantId) return json({ error: "tenant_id is required" }, 400);

  const { data: membership } = await admin
    .from("tenant_members")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!membership || !["operator", "admin"].includes(String(membership.role)))
    return json({ error: "Forbidden" }, 403);
  if (!minioConfigured()) return json({ error: "MinIO (Milano) not configured" }, 500);

  let batchId: string | null = body.batch_id ?? null;
  if (batchId) {
    const { data: batch } = await admin
      .from("finance_batches")
      .select("id")
      .eq("id", batchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!batch) return json({ error: "Batch does not belong to tenant" }, 403);
  } else {
    const { data: batch, error } = await admin
      .from("finance_batches")
      .insert({
        tenant_id: tenantId,
        name: body.batch_name ?? `دفعة ${new Date().toLocaleDateString("ar-EG")}`,
        source_phone: body.source_phone ?? null,
        status: "open",
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    batchId = batch.id;
  }

  const { data: waNumber } = FINANCE_PHONE_ID
    ? await admin
        .from("wa_numbers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone_number_id", FINANCE_PHONE_ID)
        .maybeSingle()
    : ({ data: null } as any);

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const file of (body.files ?? []).slice(0, 25)) {
    try {
      const mime = String(file.mime ?? "image/jpeg").toLowerCase();
      if (!mime.startsWith("image/"))
        throw new Error("Current finance OCR pipeline accepts image files only");
      const bytes = b64ToBytes(String(file.data_base64 ?? ""));
      if (!bytes.length) throw new Error("ملف فارغ");
      if (bytes.length > MAX_FILE_BYTES) throw new Error("الملف أكبر من 15MB");
      const hash = await sha256Hex(bytes);

      const { data: dupe } = await admin
        .from("finance_documents")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("sha256", hash)
        .maybeSingle();
      if (dupe) {
        skipped.push(file.file_name ?? hash);
        continue;
      }

      const ext = (file.file_name?.split(".").pop() ?? mime.split("/")[1] ?? "jpg")
        .toLowerCase()
        .slice(0, 5);
      const key = `${PREFIX}/${tenantId}/${hash}.${ext}`;
      await minioPut(key, bytes, mime);

      const { data: doc, error } = await admin
        .from("finance_documents")
        .insert({
          tenant_id: tenantId,
          batch_id: batchId,
          wa_number_id: waNumber?.id ?? null,
          file_name: file.file_name ?? key,
          mime,
          size_bytes: bytes.length,
          sha256: hash,
          storage_provider: "minio",
          storage_bucket: MINIO_BUCKET,
          object_key: key,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      created.push(doc.id);
    } catch (e) {
      failed.push({ name: file.file_name ?? "?", error: (e as Error).message });
    }
  }

  for (const mediaId of (body.media_wa_ids ?? []).slice(0, 200)) {
    const { data: doc } = await admin
      .from("finance_documents")
      .update({ batch_id: batchId })
      .eq("tenant_id", tenantId)
      .eq("media_wa_id", mediaId)
      .select("id")
      .maybeSingle();
    if (doc) created.push(doc.id);
    else skipped.push(mediaId);
  }

  // Bulk import from a Supabase Storage folder (e.g. media/arabesque_img).
  // Processed in bounded pages so 300+ files can be imported with repeated calls.
  let nextOffset: number | null = null;
  const src = body.storage_import;
  if (src && typeof src === "object") {
    // SECURITY: the bucket is never client-controlled, and every import is
    // confined to the caller's own tenant folder inside the tenant-scoped
    // `media` bucket. Anything resolving outside `<tenant_id>/` is rejected.
    const bucket = "media";
    const tenantRoot = String(tenantId);
    const requested = String(src.prefix ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    const relative =
      requested === tenantRoot
        ? ""
        : requested.startsWith(`${tenantRoot}/`)
          ? requested.slice(tenantRoot.length + 1)
          : requested;
    if (relative.split("/").some((segment) => segment === "..")) {
      return json({ error: "Invalid import path" }, 400);
    }
    const folder = relative ? `${tenantRoot}/${relative}` : tenantRoot;
    const offset = Math.max(Number(src.offset ?? 0), 0);
    const pageSize = Math.min(Math.max(Number(src.limit ?? 20), 1), 30);

    const { data: objects, error: listError } = await admin.storage
      .from(bucket)
      .list(folder || undefined, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (listError) return json({ error: `Storage list failed: ${listError.message}` }, 400);

    for (const obj of objects ?? []) {
      if (!obj.name || obj.id === null) continue;
      const path = folder ? `${folder}/${obj.name}` : obj.name;
      try {
        const mime = String((obj.metadata as any)?.mimetype ?? "image/jpeg").toLowerCase();
        if (!mime.startsWith("image/")) {
          skipped.push(obj.name);
          continue;
        }

        const { data: blob, error: dlError } = await admin.storage.from(bucket).download(path);
        if (dlError || !blob) throw new Error(dlError?.message ?? "download failed");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!bytes.length) throw new Error("ملف فارغ");
        if (bytes.length > MAX_FILE_BYTES) throw new Error("الملف أكبر من 15MB");
        const hash = await sha256Hex(bytes);

        const { data: dupe } = await admin
          .from("finance_documents")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("sha256", hash)
          .maybeSingle();
        if (dupe) {
          skipped.push(obj.name);
          continue;
        }

        const ext = (obj.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
        const key = `${PREFIX}/${tenantId}/${hash}.${ext}`;
        await minioPut(key, bytes, mime);

        const { data: doc, error } = await admin
          .from("finance_documents")
          .insert({
            tenant_id: tenantId,
            batch_id: batchId,
            wa_number_id: waNumber?.id ?? null,
            file_name: obj.name,
            mime,
            size_bytes: bytes.length,
            sha256: hash,
            storage_provider: "minio",
            storage_bucket: MINIO_BUCKET,
            object_key: key,
            status: "pending",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        created.push(doc.id);
      } catch (e) {
        failed.push({ name: obj.name, error: (e as Error).message });
      }
    }
    nextOffset = (objects?.length ?? 0) === pageSize ? offset + pageSize : null;
  }

  const { count } = await admin
    .from("finance_documents")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);
  await admin
    .from("finance_batches")
    .update({ total_documents: count ?? 0, status: "processing" })
    .eq("id", batchId)
    .eq("tenant_id", tenantId);

  return json({
    success: true,
    batch_id: batchId,
    created: created.length,
    skipped: skipped.length,
    failed,
    next_offset: nextOffset,
  });
});
