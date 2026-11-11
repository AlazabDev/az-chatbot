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

const WA_API_VERSION = getMetaApiVersion();
const WA_ACCESS_TOKEN = requireMetaAccessToken();

async function downloadMediaFromWA(mediaId: string): Promise<{ url: string; mime: string } | null> {
  // Step 1: Get media URL
  const metaRes = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();
  return { url: meta.url, mime: meta.mime_type };
}

async function fetchMediaBlob(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${WA_ACCESS_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

function mimeToKind(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime.includes("document") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation")
  )
    return "document";
  if (mime === "image/webp") return "sticker";
  return "other";
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/opus": "opus",
    "application/pdf": "pdf",
  };
  return map[mime] || "bin";
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
    const { tenant_id, wa_number_id, limit = 20 } = body;

    if (!tenant_id) return json({ error: "tenant_id is required" }, 400);

    // Check membership
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return json({ error: "Forbidden" }, 403);

    // Get recent messages with media (inbound messages that have provider_message_id and no text = media)
    let q = serviceClient
      .from("messages")
      .select("id, provider_message_id, meta, tenant_id, conversation_id")
      .eq("tenant_id", tenant_id)
      .eq("direction", "inbound")
      .is("text", null)
      .not("provider_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (wa_number_id) {
      // Filter by conversations linked to this wa_number
      const { data: convIds } = await serviceClient
        .from("conversations")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("wa_number_id", wa_number_id);
      if (convIds && convIds.length > 0) {
        q = q.in(
          "conversation_id",
          convIds.map((c: any) => c.id),
        );
      }
    }

    const { data: messages } = await q;
    if (!messages || messages.length === 0) {
      return json({ synced: 0, message: "لا توجد وسائط جديدة للمزامنة" });
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      // Check if media already synced
      const { data: existing } = await serviceClient
        .from("media_files")
        .select("id")
        .eq("message_id", msg.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Get media ID from meta
      const meta = msg.meta as any;
      const waMediaId =
        meta?.media_id ||
        meta?.image?.id ||
        meta?.video?.id ||
        meta?.audio?.id ||
        meta?.document?.id ||
        meta?.sticker?.id;

      if (!waMediaId) {
        skipped++;
        continue;
      }

      try {
        // Download from WhatsApp
        const mediaMeta = await downloadMediaFromWA(waMediaId);
        if (!mediaMeta) {
          errors.push(`Failed to get media URL for message ${msg.id}`);
          continue;
        }

        const blob = await fetchMediaBlob(mediaMeta.url);
        if (!blob) {
          errors.push(`Failed to download media for message ${msg.id}`);
          continue;
        }

        const ext = mimeToExt(mediaMeta.mime);
        const storageKey = `${tenant_id}/${msg.id}.${ext}`;
        const kind = mimeToKind(mediaMeta.mime);

        // Upload to Supabase storage
        const { error: uploadErr } = await serviceClient.storage
          .from("wa-media")
          .upload(storageKey, blob, {
            contentType: mediaMeta.mime,
            upsert: true,
          });

        if (uploadErr) {
          errors.push(`Storage upload error for ${msg.id}: ${uploadErr.message}`);
          continue;
        }

        // Save record
        const { error: dbErr } = await serviceClient.from("media_files").insert({
          tenant_id: msg.tenant_id,
          message_id: msg.id,
          kind: kind as any,
          mime: mediaMeta.mime,
          storage_bucket: "wa-media",
          storage_key: storageKey,
          size_bytes: blob.byteLength,
        });

        if (dbErr) {
          errors.push(`DB insert error for ${msg.id}: ${dbErr.message}`);
        } else {
          synced++;
        }
      } catch (e: any) {
        errors.push(`Error processing message ${msg.id}: ${e.message}`);
      }
    }

    return json({
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `تمت مزامنة ${synced} ملف وسائط`,
    });
  } catch (err: any) {
    console.error("media_sync_wa error:", err);
    return json({ error: err.message }, 500);
  }
});
