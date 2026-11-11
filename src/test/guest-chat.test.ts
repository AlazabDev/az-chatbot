import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatSession } from "@/components/chatbot/useChatSession";
import { sendChatMessage } from "@/lib/chatApi";

const mocks = vi.hoisted(() => ({
  listAgents: vi.fn(),
  foundryAgentChat: vi.fn(),
  foundryChat: vi.fn(),
  getUser: vi.fn(),
  upload: vi.fn(),
  guestHistory: vi.fn(),
}));

vi.mock("@/lib/agents/dispatcher.functions", () => ({
  listPublicAgents: mocks.listAgents,
}));
vi.mock("@/lib/guestHistory.functions", () => ({
  getGuestHistory: mocks.guestHistory,
}));
vi.mock("@/lib/foundry-live.functions", () => ({
  foundryAgentChat: mocks.foundryAgentChat,
}));
vi.mock("@/lib/foundry.functions", () => ({
  foundryChat: mocks.foundryChat,
}));
vi.mock("@/lib/chatUploads.functions", () => ({
  getChatUploadSignedUrl: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ upload: mocks.upload }) },
  },
}));

const AGENT_A = "21c8b298-35bf-416c-9158-46433ddcd8cf";
const AGENT_B = "f272620c-d522-461f-998c-837c06a68b8c";

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mocks.listAgents.mockResolvedValue([
    { id: AGENT_A, slug: "azabot", name: "Azabot", description: "", isDefault: true },
    { id: AGENT_B, slug: "project", name: "Project", description: "", isDefault: false },
  ]);
  mocks.foundryAgentChat.mockResolvedValue({ reply: "أهلاً", threadId: "conv.sig" });
  mocks.guestHistory.mockImplementation(async ({ data }: { data: { agentId: string } }) =>
    data.agentId === AGENT_B
      ? { messages: [], conversationId: "" }
      : { messages: [{ id: "server-one", role: "user", content: "Private A", timestamp: 1 }],
          conversationId: "thread-a.sig" });

});

describe("public guest chat", () => {
  it("sends a text message without querying Supabase user auth", async () => {
    const result = await sendChatMessage({
      message: "مرحبا", conversationId: "", files: [],
      metadata: { language: "ar", source: "web-widget", voiceEnabled: false },
      agentId: AGENT_A,
    });
    expect(result.reply).toBe("أهلاً");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.foundryAgentChat).toHaveBeenCalledWith({
      data: expect.objectContaining({ agentId: AGENT_A, message: "مرحبا", attachments: [] }),
    });
  });

  it("keeps file uploads restricted to authenticated users", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(sendChatMessage({
      message: "ملف", conversationId: "", files: [new File(["a"], "a.txt")],
      metadata: { language: "ar", source: "web-widget", voiceEnabled: false },
    })).rejects.toThrow("تتطلب تسجيل الدخول");
    expect(mocks.foundryAgentChat).not.toHaveBeenCalled();
  });

  it("allows up to two small guest images without Supabase authentication", async () => {
    const file = new File(["image data"], "photo.png", { type: "image/png" });
    const result = await sendChatMessage({
      message: "ما هذه الصورة؟", conversationId: "", files: [file],
      metadata: { language: "ar", source: "web-widget", voiceEnabled: false },
      agentId: AGENT_A,
    });
    expect(result.reply).toBe("أهلاً");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.foundryAgentChat).toHaveBeenCalledWith({
      data: expect.objectContaining({
        images: [expect.objectContaining({ dataUrl: expect.stringContaining("data:image/png;base64,") })],
        agentId: AGENT_A,
      }),
    });
  });

  it("denies public image uploads beyond the 1 MB inline threshold", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(sendChatMessage({
      message: "صورة كبيرة", conversationId: "",
      files: [new File([new Uint8Array(1_000_001)], "large.png", { type: "image/png" })],
      metadata: { language: "ar", source: "web-widget", voiceEnabled: false },
      agentId: AGENT_A,
    })).rejects.toThrow("الصور للزوار");
    expect(mocks.foundryAgentChat).not.toHaveBeenCalled();
  });

  it("restores histories only from the signed-cookie server endpoint per agent", async () => {
    // A shared device may still have old localStorage data from a different guest.
    window.localStorage.setItem("azab.chat.agent.az-agent-azabot.messages",
      JSON.stringify([{ id: "stolen", role: "user", content: "Other visitor", timestamp: 1 }]));
    const { result } = renderHook(() => useChatSession());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.messages[0]?.content).toBe("Private A");
    expect(result.current.messages.map((m) => m.content)).not.toContain("Other visitor");
    const first = result.current.selectedAgentId;
    act(() => result.current.setSelectedAgentId(AGENT_B));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBe("");
    act(() => result.current.setSelectedAgentId(first));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.messages[0]?.content).toBe("Private A");
    expect(result.current.conversationId).toBe("thread-a.sig");
    expect(mocks.guestHistory).toHaveBeenCalledWith({ data: { agentId: first } });
  });
});
