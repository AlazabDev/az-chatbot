import { createServerFn } from "@tanstack/react-start";
import { signConversation, verifyConversation } from "@/lib/threadTokens.server";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { foundryRequest } from "@/lib/foundry-transport.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RequestData = {
  agentId: string; visitorId: string; threadId?: string | null; message: string;
  attachments?: Array<{ url: string; name: string; type: string }>;
};

const chatSchema = z.object({
  agentId: z.string().regex(UUID),
  visitorId: z.string().uuid(),
  threadId: z.string().max(512).nullable().optional(),
  message: z.string().trim().min(1).max(8000),
  attachments: z.array(z.object({
    url: z.string().url().max(4096), name: z.string().max(255), type: z.string().max(128),
  })).max(10).default([]),
});

// Per-instance abuse control. Production multi-instance hosting also needs
// a gateway/shared-store rate limiter (IP data is proxy-dependent).
const limits = new Map<string, { count: number; resetAt: number }>();
function enforceGuestLimit(visitorId: string): void {
  const headers = getRequest().headers;
  const ip = headers.get("cf-connecting-ip") || headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const now = Date.now();
  if (limits.size > 10_000) {
    for (const [key, state] of limits) {
      if (state.resetAt <= now) limits.delete(key);
    }
  }
  for (const key of [`visitor:${visitorId}`, ...(ip ? [`ip:${ip}`] : [])]) {
    const state = limits.get(key);
    if (!state || state.resetAt <= now) {
      limits.set(key, { count: 1, resetAt: now + 60_000 });
    } else {
      if (state.count >= 12) throw new Error("تم تجاوز حد الرسائل. حاول بعد دقيقة.");
      state.count++;
    }
  }
}

export const foundryAgentChat = createServerFn({ method: "POST" })
  .inputValidator((data: RequestData) => {
    return chatSchema.parse(data);
  })
  .handler(async ({ data }) => {
    if (data.attachments.length) throw new Error("المرفقات تتطلب جلسة مسجلة.");
    enforceGuestLimit(data.visitorId);
    const visitorScope = `guest:${data.visitorId}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agent, error } = await supabaseAdmin.from("bot_agents")
      .select("id,agent_name,provider,agent_version,is_active")
      .eq("id", data.agentId).eq("provider", "foundry")
      .eq("is_active", true).maybeSingle();
    if (error || !agent?.agent_name) throw new Error("Selected agent is not available");

    // Each signed conversation is tied to its selected agent UUID.
    let conversation = verifyConversation(data.threadId, agent.id, visitorScope);
    if (!conversation) {
      const fresh = await foundryRequest<{ id: string }>("/openai/v1/conversations", {
        method: "POST", body: JSON.stringify({}),
      });
      if (!fresh.id) throw new Error("Foundry conversation creation failed");
      conversation = fresh.id;
    }

    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: data.message }];
    const response = await foundryRequest<{
      output_text?: string;
      output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string | { value?: string } }> }>;
    }>("/agents/" + encodeURIComponent(agent.agent_name) + "/endpoint/protocols/openai/responses?api-version=v1", {
      method: "POST",
      body: JSON.stringify({
        conversation,
        input: [{ type: "message", role: "user", content }],
      }),
    });
    const reply = response.output_text?.trim() ||
      (response.output || []).filter((o) => o.type === "message" || o.role === "assistant")
        .flatMap((o) => o.content || [])
        .map((c) => typeof c.text === "string" ? c.text : c.text?.value || "")
        .filter(Boolean).join("\n").trim();
    if (!reply) throw new Error("Selected agent produced no answer");
    return { reply, threadId: signConversation(conversation, agent.id, visitorScope),
      agent: { id: agent.id, name: agent.agent_name, version: agent.agent_version } };
  });
