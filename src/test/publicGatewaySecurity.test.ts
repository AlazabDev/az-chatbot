import { beforeEach, describe, expect, it, vi } from "vitest";
import { signConversation } from "@/lib/threadTokens.server";

const mocked = vi.hoisted(() => ({
  identity: vi.fn(),
  foundry: vi.fn(),
  agent: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/guestSession.server", () => ({
  requireGuestIdentity: mocked.identity,
}));
vi.mock("@/lib/foundry-transport.server", () => ({
  foundryRequest: mocked.foundry,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (name: string) => name === "bot_agents"
      ? {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: mocked.agent }),
                }),
              }),
            }),
          }),
        }
      : { insert: mocked.insert },
    rpc: mocked.rpc,
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://chatbot.example.com"),
}));

import { executePublicChat } from "@/lib/public-chat.server";

const agentId = "11111111-1111-4111-8111-111111111111";
const a = "22222222-2222-4222-8222-222222222222";
const b = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("THREAD_SIGNING_SECRET", "test-signing-secret-abcdefghijklmnopqrstuvwxyz");
  vi.stubEnv("CHAT_GATEWAY_HASH_SECRET", "test-gateway-secret-abcdefghijklmnopqrstuvwxyz");
  vi.stubEnv("FOUNDRY_INPUT_COST_PER_1M_TOKENS", "2");
  vi.stubEnv("FOUNDRY_OUTPUT_COST_PER_1M_TOKENS", "10");
  vi.stubEnv("CHAT_DAILY_BUDGET_USD", "5");
  mocked.identity.mockReturnValue(a);
  mocked.agent.mockResolvedValue({ data: {
    id: agentId, agent_name: "az-agent-azabot", agent_version: "1.0", is_active: true,
  }, error: null });
  mocked.rpc.mockResolvedValue({ data: true, error: null });
  mocked.insert.mockResolvedValue({ error: null });
  mocked.foundry.mockImplementation(async (path: string) => path.includes("conversations")
    ? { id: "fresh_conversation" }
    : { output_text: "OK", usage: { input_tokens: 20, output_tokens: 15 } });
});

describe("public gateway security invariants", () => {
  it("denies non-public agents before consuming any quotas or Foundry calls", async () => {
    mocked.agent.mockResolvedValueOnce({ data: null, error: null });
    await expect(executePublicChat({ agentId, visitorId: b, message: "Hello" }))
      .rejects.toThrow("AGENT_UNAVAILABLE");
    expect(mocked.rpc).not.toHaveBeenCalled();
    expect(mocked.foundry).not.toHaveBeenCalled();
  });

  it("ignores a forged client visitor ID and scopes the thread to the server cookie", async () => {
    const result = await executePublicChat({ agentId, visitorId: b, message: "Hello" });
    expect(result.reply).toBe("OK");
    expect(result.threadId).toBe(signConversation("fresh_conversation", agentId, "guest:" + a));
    const quotaCall = mocked.rpc.mock.calls.find((c) => c[0] === "consume_guest_chat_quota");
    expect(quotaCall?.[1].p_visitor_id).toBe(a);
  });

  it("refuses to reuse the signed thread of a different visitor", async () => {
    const stolen = signConversation("foreign_conversation", agentId, "guest:" + a);
    mocked.identity.mockReturnValue(b);
    const result = await executePublicChat({ agentId, visitorId: a, threadId: stolen, message: "Hello" });
    expect(result.threadId).toBe(signConversation("fresh_conversation", agentId, "guest:" + b));
    expect(mocked.foundry).toHaveBeenCalledWith("/openai/v1/conversations", expect.anything());
  });

  it("denies requests before spending provider tokens when the daily budget is exhausted", async () => {
    mocked.rpc.mockImplementation(async (name: string) => ({
      data: name === "reserve_guest_chat_budget" ? false : true, error: null,
    }));
    await expect(executePublicChat({ agentId, message: "Hello" }))
      .rejects.toThrow("CHAT_DAILY_BUDGET_EXCEEDED");
    expect(mocked.foundry).not.toHaveBeenCalled();
  });

  it("fails closed if model price configuration is missing", async () => {
    vi.stubEnv("FOUNDRY_OUTPUT_COST_PER_1M_TOKENS", "");
    await expect(executePublicChat({ agentId, message: "Hello" }))
      .rejects.toThrow("CHAT_COST_NOT_CONFIGURED");
    expect(mocked.foundry).not.toHaveBeenCalled();
  });
});
