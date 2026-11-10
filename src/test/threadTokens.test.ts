import { afterEach, describe, expect, it, vi } from "vitest";
import { signConversation, verifyConversation } from "@/lib/threadTokens.server";

afterEach(() => vi.unstubAllEnvs());
describe("Conversation ownership", () => {
  it("accepts the same authenticated visitor and agent", () => {
    vi.stubEnv("THREAD_SIGNING_SECRET", "test-only-signing-secret");
    const token = signConversation("conv_123", "agent-1", "user-1");
    expect(verifyConversation(token, "agent-1", "user-1")).toBe("conv_123");
  });
  it("rejects a conversation copied to another account", () => {
    vi.stubEnv("THREAD_SIGNING_SECRET", "test-only-signing-secret");
    expect(verifyConversation(signConversation("conv_123", "agent-1", "user-1"), "agent-1", "user-2")).toBeNull();
  });
  it("rejects a conversation reused with another agent", () => {
    vi.stubEnv("THREAD_SIGNING_SECRET", "test-only-signing-secret");
    expect(verifyConversation(signConversation("conv_123", "agent-1", "user-1"), "agent-2", "user-1")).toBeNull();
  });
  it("rejects a tampered conversation identifier", () => {
    vi.stubEnv("THREAD_SIGNING_SECRET", "test-only-signing-secret");
    const token = signConversation("conv_123", "agent-1", "user-1").replace("conv_123", "conv_999");
    expect(verifyConversation(token, "agent-1", "user-1")).toBeNull();
  });
});