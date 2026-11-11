import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(() => cookies.value),
  setCookie: cookies.set,
}));

import {
  signGuestSession,
  verifyGuestSession,
  requireGuestIdentity,
} from "@/lib/guestSession.server";

const key = "unit-test-signing-key-is-at-least-32-characters";
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  cookies.value = undefined;
  cookies.set.mockReset();
  vi.stubEnv("CHAT_GATEWAY_HASH_SECRET", key);
});

describe("signed public visitor identity", () => {
  it("accepts a valid unexpired visitor session and rejects modification", () => {
    const issued = Date.now();
    const token = signGuestSession(first, issued, key);
    expect(verifyGuestSession(token, key, issued)).toBe(first);
    expect(verifyGuestSession(token.replace(first, second), key, issued)).toBeNull();
    expect(verifyGuestSession(token, "another-test-key", issued)).toBeNull();
  });

  it("rejects expired and future-dated sessions", () => {
    const now = Date.now();
    const old = signGuestSession(first, now - 31 * 24 * 60 * 60 * 1000, key);
    const future = signGuestSession(first, now + 61_000, key);
    expect(verifyGuestSession(old, key, now)).toBeNull();
    expect(verifyGuestSession(future, key, now)).toBeNull();
  });

  it("issues an HttpOnly cookie and reuses an already signed visitor", () => {
    const id = requireGuestIdentity();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(cookies.set).toHaveBeenCalledOnce();
    const [name, token, options] = cookies.set.mock.calls[0];
    expect(name).toBe("azab_guest_session");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/" });
    cookies.value = token;
    expect(requireGuestIdentity()).toBe(id);
    expect(cookies.set).toHaveBeenCalledOnce();
  });

  it("fails closed without a signing secret", () => {
    vi.stubEnv("CHAT_GATEWAY_HASH_SECRET", "");
    vi.stubEnv("THREAD_SIGNING_SECRET", "");
    expect(() => requireGuestIdentity()).toThrow("signing key");
  });
});
