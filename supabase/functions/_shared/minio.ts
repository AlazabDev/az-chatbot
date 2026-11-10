// Minimal S3v4 (AWS Signature V4) client for the Milano MinIO bucket.
const ENDPOINT = (Deno.env.get("MINIO_ENDPOINT") ?? "").replace(/\/+$/, "");
const ACCESS_KEY = Deno.env.get("MINIO_ACCESS_KEY") ?? "";
const SECRET_KEY = Deno.env.get("MINIO_SECRET_KEY") ?? "";
const REGION = Deno.env.get("MINIO_REGION") ?? "us-east-1";
export const MINIO_BUCKET = Deno.env.get("MINIO_BUCKET") ?? "myminio";

const enc = new TextEncoder();

function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function sha256Hex(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
function uriEncode(str: string, encodeSlash = true) {
  return str
    .split("")
    .map((c) => {
      if (/[A-Za-z0-9\-._~]/.test(c)) return c;
      if (c === "/") return encodeSlash ? "%2F" : "/";
      return Array.from(enc.encode(c))
        .map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0"))
        .join("");
    })
    .join("");
}

export function minioConfigured() {
  return Boolean(ENDPOINT && ACCESS_KEY && SECRET_KEY);
}

async function signedRequest(
  method: string,
  key: string,
  body?: Uint8Array,
  contentType?: string,
  query: Record<string, string> = {},
): Promise<Request> {
  const url = new URL(`${ENDPOINT}/${MINIO_BUCKET}/${key.replace(/^\/+/, "")}`);
  const canonicalUri = uriEncode(url.pathname, false);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body ?? new Uint8Array());

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );

  let signingKey = await hmac(enc.encode("AWS4" + SECRET_KEY), dateStamp);
  signingKey = await hmac(signingKey, REGION);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = hex((await hmac(signingKey, stringToSign)).buffer as ArrayBuffer);

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Request(url.toString(), { method, headers, body: body as BodyInit | undefined });
}

export async function minioPut(
  key: string,
  body: Uint8Array,
  contentType = "application/octet-stream",
) {
  const req = await signedRequest("PUT", key, body, contentType);
  const res = await fetch(req);
  if (!res.ok) throw new Error(`MinIO PUT ${key} failed: ${res.status} ${await res.text()}`);
  return { bucket: MINIO_BUCKET, key };
}

export async function minioGet(key: string): Promise<Uint8Array> {
  const req = await signedRequest("GET", key);
  const res = await fetch(req);
  if (!res.ok) throw new Error(`MinIO GET ${key} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Presigned GET URL (query-string signing), default 1 hour. */
export async function minioPresignGet(key: string, expiresIn = 3600): Promise<string> {
  const url = new URL(`${ENDPOINT}/${MINIO_BUCKET}/${key.replace(/^\/+/, "")}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(q[k])}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    uriEncode(url.pathname, false),
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );
  let signingKey = await hmac(enc.encode("AWS4" + SECRET_KEY), dateStamp);
  signingKey = await hmac(signingKey, REGION);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = hex((await hmac(signingKey, stringToSign)).buffer as ArrayBuffer);
  return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
