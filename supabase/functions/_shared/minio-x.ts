// Minimal S3 (MinIO) client: AWS SigV4 signed PUT / GET presign, no deps.

const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

function amzDate(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { long: iso, short: iso.slice(0, 8) };
}

function encodeKey(key: string) {
  return key.split("/").map((s) => encodeURIComponent(s)).join("/");
}

export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export function getMinioConfig(): MinioConfig {
  const endpoint = (Deno.env.get("MINIO_ENDPOINT") ?? "").replace(/\/+$/, "");
  const accessKey = Deno.env.get("MINIO_ACCESS_KEY") ?? "";
  const secretKey = Deno.env.get("MINIO_SECRET_KEY") ?? "";
  const bucket = Deno.env.get("MINIO_BUCKET") ?? "";
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new Error("MinIO configuration is incomplete");
  }
  return { endpoint, accessKey, secretKey, bucket, region: Deno.env.get("MINIO_REGION") ?? "us-east-1" };
}

async function signingKey(cfg: MinioConfig, short: string): Promise<Uint8Array> {
  let k = await hmac(enc.encode("AWS4" + cfg.secretKey), short);
  k = await hmac(k, cfg.region!);
  k = await hmac(k, "s3");
  return await hmac(k, "aws4_request");
}

/** Upload an object with a signed PUT. Returns the object URL. */
export async function putObject(
  cfg: MinioConfig,
  key: string,
  body: Uint8Array,
  contentType = "application/octet-stream",
): Promise<string> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}`);
  const { long, short } = amzDate();
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: url.host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": long,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join("");
  const canonicalRequest = [
    "PUT",
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${short}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", long, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = hex(await hmac(await signingKey(cfg, short), stringToSign));

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: body as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MinIO upload failed [${res.status}]: ${text}`);
  }
  return url.toString();
}

/** Build a presigned GET URL valid for `expiresIn` seconds. */
export async function presignGet(cfg: MinioConfig, key: string, expiresIn = 3600): Promise<string> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}`);
  const { long, short } = amzDate();
  const scope = `${short}/${cfg.region}/s3/aws4_request`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKey}/${scope}`,
    "X-Amz-Date": long,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  const sortedQuery = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

  const canonicalRequest = [
    "GET",
    url.pathname,
    sortedQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", long, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = hex(await hmac(await signingKey(cfg, short), stringToSign));

  return `${url.origin}${url.pathname}?${sortedQuery}&X-Amz-Signature=${signature}`;
}
