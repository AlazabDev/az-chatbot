import { createHmac, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE = "azab_guest_session";
const TTL_SECONDS = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signingKey(): string {
  const key = process.env.CHAT_GATEWAY_HASH_SECRET || process.env.THREAD_SIGNING_SECRET;
  if (!key || key.length < 32) throw new Error("Guest session signing key must be at least 32 characters");
  return key;
}

function mac(payload: string, key: string): string {
  return createHmac("sha256", key).update("chat-guest-v1:" + payload).digest("hex");
}

export function signGuestSession(id: string, issuedAt: number, key: string): string {
  if (!UUID.test(id) || !Number.isInteger(issuedAt)) throw new Error("Invalid visitor session");
  const payload = id + "." + issuedAt;
  return payload + "." + mac(payload, key);
}

export function verifyGuestSession(token: string | undefined, key: string, now = Date.now()): string | null {
  if (!token || token.length > 200) return null;
  const match = /^([0-9a-f-]{36})\.(\d{10,13})\.([a-f0-9]{64})$/i.exec(token);
  if (!match || !UUID.test(match[1])) return null;
  const issued = Number(match[2]);
  if (!Number.isSafeInteger(issued) || issued > now + 60_000 || now - issued > TTL_SECONDS * 1000) return null;
  const expected = Buffer.from(mac(match[1] + "." + match[2], key), "hex");
  const given = Buffer.from(match[3], "hex");
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
}

/** Server-only identity: never trust the visitorId supplied in JSON or localStorage. */
export function requireGuestIdentity(): string {
  const key = signingKey();
  const valid = verifyGuestSession(getCookie(COOKIE), key);
  if (valid) return valid;
  const visitorId = crypto.randomUUID();
  setCookie(COOKIE, signGuestSession(visitorId, Date.now(), key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
  return visitorId;
}
