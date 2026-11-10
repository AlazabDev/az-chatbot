import { signConversation, verifyConversation } from "@/lib/threadTokens.server";
import { getRequest } from "@tanstack/react-start/server";
import { createHmac } from "node:crypto";
import { foundryRequest } from "@/lib/foundry-transport.server";

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

export interface PublicChatInput {
  agentId: string;
  visitorId: string;
  threadId?: string | null;
  message: string;
  attachments?: Array<{ url: string; name: string; type: string }>;
  images?: Array<{ dataUrl: string }>;
}

export interface PublicChatResult {
  reply: string;
  threadId: string;
  agent: { id: string; name: string; version: string };
  requestId: string;
  latencyMs: number;
}

export async function executePublicChat(data: PublicChatInput): Promise<PublicChatResult> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  if (data.attachments?.length) throw new Error("ATTACHMENTS_REQUIRE_AUTH");
  if ((data.images?.length || 0) > 2) throw new Error("TOO_MANY_IMAGES");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agent, error } = await supabaseAdmin.from("bot_agents")
    .select("id,agent_name,agent_version,is_active")
    .eq("id", data.agentId).eq("provider", "foundry")
    .eq("is_active", true).eq("public_access", true).maybeSingle();
  if (error || !agent?.agent_name) throw new Error("AGENT_UNAVAILABLE");

  // Only explicitly public agents can incur costs; quota is checked afterwards.
  await enforceGuestLimit(data.visitorId, data.agentId);
  const visitorScope = `guest:${data.visitorId}`;
  const conversation = verifyConversation(data.threadId, agent.id, visitorScope);
  const created = conversation ? null : await foundryRequest<{ id: string }>("/openai/v1/conversations", {
    method: "POST", body: JSON.stringify({}),
  });
  const conversationId = conversation ?? created?.id;
  if (!conversationId) throw new Error("FOUNDRY_CONVERSATION_FAILED");

  const inputContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: data.message || "يرجى تحليل الصورة المرفقة." },
  ];
  for (const item of data.images ?? []) {
    const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(item.dataUrl);
    if (!match || match[2].length > 1_400_000) throw new Error("INVALID_IMAGE");
    inputContent.push({ type: "input_image", image_url: item.dataUrl });
  }
  const response = await foundryRequest<{
    output_text?: string;
    output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string | { value?: string } }> }>;
  }>("/agents/" + encodeURIComponent(agent.agent_name) + "/endpoint/protocols/openai/responses?api-version=v1", {
    method: "POST",
    body: JSON.stringify({
      conversation: conversationId,
      input: [{ type: "message", role: "user", content: inputContent }],
    }),
  });
  const reply = response.output_text?.trim() ||
    (response.output || []).filter((o) => o.type === "message" || o.role === "assistant")
      .flatMap((o) => o.content || [])
      .map((c) => typeof c.text === "string" ? c.text : c.text?.value || "")
      .filter(Boolean).join("\n").trim();
  if (!reply) throw new Error("EMPTY_FOUNDRY_RESPONSE");
  const latencyMs = Date.now() - started;
  console.info(JSON.stringify({
    event: "public_chat_completed", requestId, agentId: agent.id, latencyMs,
    messageChars: data.message.length, replyChars: reply.length,
  }));
  return {
    reply, threadId: signConversation(conversationId, agent.id, visitorScope),
    agent: { id: agent.id, name: agent.agent_name, version: agent.agent_version },
    requestId, latencyMs,
  };
}
