// Helpers for the WhatsApp Cloud API + MinIO archiving, shared by functions.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMinioConfig, putObject } from "./minio.ts";

export const GRAPH = "https://graph.facebook.com/v21.0";

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf",
  };
  return map[mime] ?? (mime.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "");
}

export function mediaKind(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/** Download a WhatsApp media item and store it in MinIO; returns the stored file record fields. */
export async function archiveMedia(opts: {
  token: string;
  mediaId: string;
  userId: string;
  accountId: string;
  filenameHint?: string;
}) {
  const metaRes = await fetch(`${GRAPH}/${opts.mediaId}`, {
    headers: { Authorization: `Bearer ${opts.token}` },
  });
  if (!metaRes.ok) throw new Error(`Media metadata failed [${metaRes.status}]: ${await metaRes.text()}`);
  const meta = await metaRes.json() as { url: string; mime_type: string; file_size?: number; sha256?: string };

  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${opts.token}` } });
  if (!binRes.ok) throw new Error(`Media download failed [${binRes.status}]: ${await binRes.text()}`);
  const bytes = new Uint8Array(await binRes.arrayBuffer());

  const mime = meta.mime_type?.split(";")[0] ?? "application/octet-stream";
  const fileName = opts.filenameHint || `${mediaKind(mime)}_${opts.mediaId}.${extFromMime(mime)}`;
  const d = new Date();
  const key = `${opts.userId}/${opts.accountId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${opts.mediaId}-${fileName}`;

  const cfg = getMinioConfig();
  const storageUrl = await putObject(cfg, key, bytes, mime);

  return {
    wa_media_id: opts.mediaId,
    file_name: fileName,
    mime_type: mime,
    media_type: mediaKind(mime),
    size_bytes: bytes.byteLength,
    storage_key: key,
    storage_url: storageUrl,
    status: "stored",
  };
}
