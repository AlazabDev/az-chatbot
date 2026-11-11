/** Verify Meta X-Hub-Signature-256 against the *unmodified* HTTP request body.
 * This module is intentionally runtime-neutral (Deno and Node WebCrypto).
 */
export async function verifyMetaSignature(rawBody, signature, appSecret) {
  if (typeof appSecret !== 'string' || appSecret.length === 0) return false;
  if (typeof signature !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  if (!(typeof rawBody === 'string' || rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody))) return false;
  const bytes = typeof rawBody === 'string'
    ? new TextEncoder().encode(rawBody)
    : rawBody instanceof ArrayBuffer
      ? new Uint8Array(rawBody)
      : new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  const supplied = signature.slice(7).toLowerCase();
  let diff = 0;
  for (let i = 0; i < mac.length; i++) {
    const expectedByte = mac[i];
    const suppliedByte = Number.parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
    diff |= expectedByte ^ suppliedByte;
  }
  return diff === 0;
}
