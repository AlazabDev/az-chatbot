import { signConversation, verifyConversation } from "@/lib/threadTokens.server";
import { getRequest } from "@tanstack/react-start/server";
import { createHmac } from "node:crypto";
import { foundryRequest } from "@/lib/foundry-transport.server";
import { requireGuestIdentity } from "@/lib/guestSession.server";

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
  /** Legacy client hint only: the server uses its signed HttpOnly visitor cookie. */
  visitorId?: string;
  threadId?: string | null;
  message: string;
  attachments?: Array<{ url: string; name: string; type: string }>;
  images?: Array<{ dataUrl: string }>;
  documents?: Array<{ name: string; dataUrl: string }>;
}

export interface PublicChatResult {
  reply: string;
  threadId: string;
  agent: { id: string; name: string; version: string };
  requestId: string;
  latencyMs: number;
}

export async function executePublicChat(data: PublicChatInput): Promise<PublicChatResult> {
  const incoming = getRequest();
  const origin = incoming.headers.get("origin");
  if (origin && origin !== new URL(incoming.url).origin) throw new Error("FORBIDDEN_ORIGIN");
  const requestId = crypto.randomUUID();
  const started = Date.now();
  if (data.attachments?.length) throw new Error("ATTACHMENTS_REQUIRE_AUTH");
  if ((data.images?.length || 0) > 2) throw new Error("TOO_MANY_IMAGES");
  if ((data.documents?.length || 0) > 1) throw new Error("TOO_MANY_DOCUMENTS");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agent, error } = await supabaseAdmin.from("bot_agents")
    .select("id,agent_name,agent_version,is_active")
    .eq("id", data.agentId).eq("provider", "foundry")
    .eq("is_active", true).eq("public_access", true).maybeSingle();
  if (error || !agent?.agent_name) throw new Error("AGENT_UNAVAILABLE");

  const visitorId = requireGuestIdentity();
  // Fail closed if prices have not been set for the actual Foundry model.
  const inputRate = Number(process.env.FOUNDRY_INPUT_COST_PER_1M_TOKENS);
  const outputRate = Number(process.env.FOUNDRY_OUTPUT_COST_PER_1M_TOKENS);
  const dailyLimit = Number(process.env.CHAT_DAILY_BUDGET_USD || "5");
  if (!(inputRate > 0 && outputRate > 0 && dailyLimit > 0)) {
    throw new Error("CHAT_COST_NOT_CONFIGURED");
  }
  const imageCount = data.images?.length ?? 0;
  const pdfCount = data.documents?.length ?? 0;
  // Conservative reservation. It is never returned to the daily pool even on failure.
  const reserveUsd = Number(Math.max(pdfCount ? 1 : 0.25,
    ((16000 + imageCount * 9000 + pdfCount * 50000) * inputRate + 1024 * outputRate) / 1_000_000).toFixed(6));
  await enforceGuestLimit(visitorId, data.agentId);
  const { data: reserved, error: reservationError } = await supabaseAdmin.rpc(
    "reserve_guest_chat_budget", {
      p_request_id: requestId,
      p_reserve_usd: reserveUsd,
      p_daily_limit_usd: dailyLimit,
    });
  if (reservationError) {
    console.error("[chat-gateway] budget database unavailable", reservationError.code);
    throw new Error("CHAT_BUDGET_UNAVAILABLE");
  }
  if (!reserved) throw new Error("CHAT_DAILY_BUDGET_EXCEEDED");
  const visitorScope = `guest:${visitorId}`;
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
  for (const doc of data.documents ?? []) {
    const matched = /^data:application\/pdf;base64,([a-zA-Z0-9+/]+={0,2})$/.exec(doc.dataUrl);
    if (!matched || matched[1].length > 350_000 ||
        !Buffer.from(matched[1], "base64").subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("INVALID_GUEST_PDF");
    }
    const safeName = doc.name.replace(/[\\/]/g, "_").slice(0, 120);
    if (!/\.pdf$/i.test(safeName)) throw new Error("INVALID_GUEST_PDF");
    inputContent.push({ type: "input_file", filename: safeName, file_data: doc.dataUrl });
  }
  const response = await foundryRequest<{
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string | { value?: string } }> }>;
  }>("/agents/" + encodeURIComponent(agent.agent_name) + "/endpoint/protocols/openai/responses?api-version=v1", {
    method: "POST",
    body: JSON.stringify({
      conversation: conversationId,
      max_output_tokens: 1024,
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
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const estimatedUsd = inputTokens !== null && outputTokens !== null &&
    Number.isFinite(inputRate) && Number.isFinite(outputRate)
    ? Number(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000).toFixed(6))
    : null;
  if (estimatedUsd !== null) {
    const { error: finalizationError } = await supabaseAdmin.rpc("finalize_guest_chat_budget", {
      p_request_id: requestId, p_actual_usd: estimatedUsd,
    });
    if (finalizationError) console.error("[chat-gateway] budget reconciliation failed", finalizationError.code);
  }
  const { error: metricError } = await supabaseAdmin.from("chat_gateway_usage").insert({
    request_id: requestId,
    agent_id: agent.id,
    outcome: "success",
    latency_ms: latencyMs,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedUsd,
  });
  if (metricError) console.warn(JSON.stringify({
    event: "public_chat_usage_store_failed", requestId, code: metricError.code,
  }));
  const { error: historyError } = await supabaseAdmin.rpc("append_guest_chat_turn", {
    p_visitor_id: visitorId,
    p_agent_id: agent.id,
    p_thread_token: signConversation(conversationId, agent.id, visitorScope),
    p_message: data.message,
    p_reply: reply,
  });
  if (historyError) console.warn(JSON.stringify({
    event: "public_chat_history_failed", requestId, code: historyError.code,
  }));
  console.info(JSON.stringify({
    event: "public_chat_completed", requestId, agentId: agent.id, latencyMs,
    inputTokens, outputTokens, estimatedUsd, reserveUsd,
    messageChars: data.message.length, replyChars: reply.length,
  }));
  return {
    reply, threadId: signConversation(conversationId, agent.id, visitorScope),
    agent: { id: agent.id, name: agent.agent_name, version: agent.agent_version },
    requestId, latencyMs,
  };
}
