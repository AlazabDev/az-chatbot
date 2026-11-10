import { createServerFn } from "@tanstack/react-start";
import { signConversation, verifyConversation } from "@/lib/threadTokens.server";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { createHmac } from "node:crypto";
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

/**
 * Resolve an address only from a header explicitly trusted by deployment configuration.
 * Without that configuration the global/visitor/agent DB quotas still apply.
 */
function clientIdentity(visitorId: string): string {
  const trustedHeader = process.env.CHAT_TRUSTED_IP_HEADER?.toLowerCase();
  const allowed = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];
  let address: string | null = null;
  if (trustedHeader && allowed.includes(trustedHeader)) {
    const header = getRequest().headers.get(trustedHeader);
    address = header?.split(",")[0]?.trim() || null;
  }
  const secret = process.env.CHAT_GATEWAY_HASH_SECRET || process.env.THREAD_SIGNING_SECRET;
  if (!secret) throw new Error("Chat gateway signing secret is not configured");
  return createHmac("sha256", secret).update(address ? `ip:${address}` : `visitor:${visitorId}`).digest("hex");
}

async function enforceGuestLimit(visitorId: string, agentId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_guest_chat_quota", {
    p_visitor_id: visitorId,
    p_ip_hash: clientIdentity(visitorId),
    p_agent_id: agentId,
  });
  if (error) {
    console.error("[chat-gateway] quota store unavailable", error.code);
    throw new Error("خدمة المحادثة غير متاحة مؤقتاً.");
  }
  if (data !== true) throw new Error("تم تجاوز حد استخدام المحادثة. حاول لاحقاً.");
}

export const foundryAgentChat = createServerFn({ method: "POST" })
  .inputValidator((data: RequestData) => {
    return chatSchema.parse(data);
  })
  .handler(async ({ data }) => {
    if (data.attachments.length) throw new Error("المرفقات تتطلب جلسة مسجلة.");
    await enforceGuestLimit(data.visitorId, data.agentId);
    const visitorScope = `guest:${data.visitorId}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agent, error } = await supabaseAdmin.from("bot_agents")
      .select("id,agent_name,provider,agent_version,is_active")
      .eq("id", data.agentId).eq("provider", "foundry")
      .eq("is_active", true).eq("public_access", true).maybeSingle();
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
