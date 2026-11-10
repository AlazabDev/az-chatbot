import { beforeEach, describe, expect, it, vi } from "vitest";
import { getChatStorage, getChatVisitorId, setChatStorage } from "@/lib/chatStorage";

beforeEach(() => window.localStorage.clear());

describe("chat visitor storage", () => {
  it("uses a persistent UUID for the same browser visitor", () => {
    const first = getChatVisitorId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getChatVisitorId()).toBe(first);
    expect(window.localStorage.getItem("azab.chat.visitorId")).toBe(first);
  });

  it("does not reuse a stale visitor after storage is explicitly cleared", () => {
    const first = getChatVisitorId();
    window.localStorage.clear();
    expect(getChatVisitorId()).not.toBe(first);
  });

  it("preserves values when localStorage write access is blocked", () => {
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    try {
      setChatStorage("blocked-key", "safe-fallback");
      expect(getChatStorage("blocked-key")).toBe("safe-fallback");
    } finally {
      spy.mockRestore();
      Storage.prototype.setItem = original;
    }
  });
});
