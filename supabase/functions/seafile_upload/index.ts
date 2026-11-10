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

/**
 * Upload a file to Seafile from WhatsApp media.
 * Called internally by worker_dispatch or directly.
 *
 * Body: { tenant_id, media_id (WA media ID), file_name, mime_type, message_id? }
 * Or: { tenant_id, file_url, file_name, mime_type }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { tenant_id, media_id, file_name, mime_type, message_id, file_url } = body;

    if (!tenant_id) return json({ error: "tenant_id is required" }, 400);

    const seafileUrl = Deno.env.get("SEAFILE_URL");
    const seafileToken = Deno.env.get("SEAFILE_TOKEN");
    const seafileRepoId = Deno.env.get("SEAFILE_REPO_ID");

    if (!seafileUrl || !seafileToken || !seafileRepoId) {
      return json({ error: "Seafile credentials not configured" }, 500);
    }

    // Step 1: Download the file (from WA media API or direct URL)
    let fileBytes: Uint8Array;
    let actualFileName = file_name || `media_${Date.now()}`;

    if (media_id) {
      // Download from WhatsApp Cloud API
      const waAccessToken = requireMetaAccessToken();
      const apiVersion = getMetaApiVersion();

      // Get media URL from Meta
      const mediaInfoRes = await fetch(`https://graph.facebook.com/${apiVersion}/${media_id}`, {
        headers: { Authorization: `Bearer ${waAccessToken}` },
      });
      const mediaInfo = await mediaInfoRes.json();

      if (!mediaInfo.url) {
        return json({ error: "Failed to get media URL from Meta", details: mediaInfo }, 502);
      }

      // Download actual file
      const fileRes = await fetch(mediaInfo.url, {
        headers: { Authorization: `Bearer ${waAccessToken}` },
      });

      if (!fileRes.ok) {
        return json({ error: "Failed to download media from Meta" }, 502);
      }

      fileBytes = new Uint8Array(await fileRes.arrayBuffer());

      // Generate file extension from mime
      const ext = getExtFromMime(mime_type || mediaInfo.mime_type || "");
      if (!file_name) {
        actualFileName = `wa_${media_id.substring(0, 10)}_${Date.now()}${ext}`;
      }
    } else if (file_url) {
      const fileRes = await fetch(file_url);
      if (!fileRes.ok) {
        return json({ error: "Failed to download file from URL" }, 502);
      }
      fileBytes = new Uint8Array(await fileRes.arrayBuffer());
    } else {
      return json({ error: "media_id or file_url is required" }, 400);
    }

    // Step 2: Organize by tenant/year-month
    const now = new Date();
    const folderPath = `/whatsapp/${tenant_id.substring(0, 8)}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Create directories recursively
    const parts = folderPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
      currentPath += `/${part}`;
      await fetch(
        `${seafileUrl}/api2/repos/${seafileRepoId}/dir/?p=${encodeURIComponent(currentPath)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${seafileToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "operation=mkdir",
        },
      );
    }

    // Step 3: Get upload link with matching parent_dir (p parameter)
    const uploadLinkRes = await fetch(
      `${seafileUrl}/api2/repos/${seafileRepoId}/upload-link/?p=${encodeURIComponent(folderPath)}`,
      { headers: { Authorization: `Token ${seafileToken}` } },
    );

    if (!uploadLinkRes.ok) {
      const errText = await uploadLinkRes.text();
      return json({ error: "Failed to get Seafile upload link", details: errText }, 502);
    }

    const uploadUrl = (await uploadLinkRes.text()).replace(/"/g, "");

    // Upload the file
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileBytes], { type: mime_type || "application/octet-stream" }),
      actualFileName,
    );
    formData.append("parent_dir", folderPath);
    formData.append("replace", "1");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Token ${seafileToken}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return json({ error: "Failed to upload to Seafile", details: errText }, 502);
    }

    const seafilePath = `${folderPath}/${actualFileName}`;

    // Step 4: Get download link for the uploaded file
    const dlLinkRes = await fetch(
      `${seafileUrl}/api2/repos/${seafileRepoId}/file/?p=${encodeURIComponent(seafilePath)}`,
      { headers: { Authorization: `Token ${seafileToken}` } },
    );

    let downloadUrl = "";
    if (dlLinkRes.ok) {
      downloadUrl = (await dlLinkRes.text()).replace(/"/g, "");
    }

    // Step 5: Update media_files record if message_id provided
    if (message_id) {
      await serviceClient
        .from("media_files")
        .update({
          storage_key: seafilePath,
          storage_bucket: "seafile",
        })
        .eq("tenant_id", tenant_id)
        .eq("message_id", message_id);
    }

    // Audit log
    await serviceClient.from("audit_logs").insert({
      tenant_id,
      action: "SEAFILE_UPLOAD",
      entity: "media_files",
      meta: {
        file_name: actualFileName,
        seafile_path: seafilePath,
        size_bytes: fileBytes.length,
        mime_type: mime_type || null,
        media_id: media_id || null,
      },
    });

    return json({
      success: true,
      file_name: actualFileName,
      seafile_path: seafilePath,
      download_url: downloadUrl,
      size_bytes: fileBytes.length,
    });
  } catch (err) {
    console.error("seafile_upload error:", err);
    return json({ error: err.message }, 500);
  }
});

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/aac": ".aac",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/msword": ".doc",
  };
  return map[mime] || "";
}
