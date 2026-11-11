import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireGuestIdentity } from "@/lib/guestSession.server";
import { accessToken } from "@/lib/foundry-transport.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({
  agentId: z.string().refine((id) => UUID.test(id) || /^az-agent-[a-z0-9_-]{1,110}$/i.test(id)),
  sdp: z.string().min(30).max(32_000),
});

export type GuestRealtimeResult =
  | { supported: true; sdpAnswer: string; maxDurationSeconds: number }
  | { supported: false; reason: "not_configured" | "unavailable" };

function realtimeOrigin(): string | null {
  const raw = process.env.FOUNDRY_REALTIME_ENDPOINT;
  if (!raw) return null;
  const value = new URL(raw);
  if (value.protocol !== "https:" ||
      !value.hostname.endsWith(".openai.azure.com") ||
      value.pathname !== "/" || value.search || value.hash ||
      value.username || value.password || value.port) {
    throw new Error("Invalid Foundry realtime resource endpoint");
  }
  return value.origin;
}

/** Pure server-to-server WebRTC negotiation. Ephemeral keys never reach the browser. */
export const guestRealtimeOffer = createServerFn({ method: "POST" })
  .inputValidator((data: { agentId: string; sdp: string }) => schema.parse(data))
  .handler(async ({ data }): Promise<GuestRealtimeResult> => {
    const req = getRequest();
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) throw new Error("FORBIDDEN_ORIGIN");

    const resource = realtimeOrigin();
    const deployment = process.env.FOUNDRY_REALTIME_DEPLOYMENT;
    const reserveUsd = Number(process.env.CHAT_REALTIME_RESERVE_USD);
    const dailyLimit = Number(process.env.CHAT_DAILY_BUDGET_USD || "5");
    if (!resource || !deployment || !(reserveUsd > 0 && reserveUsd <= 25) ||
      !(dailyLimit > 0 && dailyLimit <= 500)) {
      return { supported: false, reason: "not_configured" };
    }
    const visitorId = requireGuestIdentity();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lookup = supabaseAdmin.from("bot_agents")
      .select("id,agent_name,system_prompt")
      .eq("provider", "foundry")
      .eq("is_active", true).eq("public_access", true);
    const { data: agent, error } = await (UUID.test(data.agentId)
      ? lookup.eq("id", data.agentId).maybeSingle()
      : lookup.eq("agent_name", data.agentId).maybeSingle());
    if (error || !agent) throw new Error("AGENT_UNAVAILABLE");

    // The same transactional per-visitor and global request quota used by text chat.
    const { createHmac } = await import("node:crypto");
    const trusted = process.env.CHAT_TRUSTED_IP_HEADER?.toLowerCase();
    const headerAllowed = ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"].includes(trusted || "");
    const address = headerAllowed ? req.headers.get(trusted!)?.split(",")[0]?.trim() : null;
    const secret = process.env.CHAT_GATEWAY_HASH_SECRET || process.env.THREAD_SIGNING_SECRET;
    if (!secret || secret.length < 32) throw new Error("CHAT_UNAVAILABLE");
    const ipHash = createHmac("sha256", secret)
      .update(address ? `ip:${address}` : `visitor:${visitorId}`).digest("hex");
    const { data: allowed, error: quotaError } = await supabaseAdmin.rpc("consume_guest_chat_quota", {
      p_visitor_id: visitorId, p_ip_hash: ipHash, p_agent_id: agent.id,
    });
    if (quotaError || !allowed) throw new Error("RATE_LIMITED");
    const requestId = crypto.randomUUID();
    const { data: reserved, error: budgetError } = await supabaseAdmin.rpc("reserve_guest_chat_budget", {
      p_request_id: requestId,
      p_reserve_usd: reserveUsd,
      p_daily_limit_usd: dailyLimit,
    });
    if (budgetError || !reserved) throw new Error("CHAT_DAILY_BUDGET_EXCEEDED");

    try {
      const token = await accessToken();
      const api = resource + "/openai/v1/realtime";
      const secretResponse = await fetch(api + "/client_secrets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: deployment,
            instructions: typeof agent.system_prompt === "string" && agent.system_prompt.trim()
              ? agent.system_prompt.slice(0, 8000)
              : `You are ${agent.agent_name}. Respond in the user's language. No tools are available.`,
            audio: { output: { voice: "alloy" } },
            tools: [], tool_choice: "none",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!secretResponse.ok) {
        console.warn(JSON.stringify({ event: "guest_realtime_session_unavailable", status: secretResponse.status, requestId }));
        return { supported: false, reason: "unavailable" };
      }
      const session = await secretResponse.json() as { value?: string; client_secret?: { value?: string } };
      const ephemeral = session.value || session.client_secret?.value;
      if (!ephemeral) return { supported: false, reason: "unavailable" };
      const sdpResponse = await fetch(api + "/calls?webrtcfilter=on", {
        method: "POST",
        headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" },
        body: data.sdp,
        signal: AbortSignal.timeout(20_000),
      });
      if (!sdpResponse.ok) {
        console.warn(JSON.stringify({ event: "guest_realtime_sdp_unavailable", status: sdpResponse.status, requestId }));
        return { supported: false, reason: "unavailable" };
      }
      const sdpAnswer = await sdpResponse.text();
      if (!sdpAnswer.startsWith("v=0") || sdpAnswer.length > 80_000)
        return { supported: false, reason: "unavailable" };
      console.info(JSON.stringify({ event: "guest_realtime_connected", requestId, agentId: agent.id, reservedUsd: reserveUsd }));
      return { supported: true, sdpAnswer, maxDurationSeconds: 120 };
    } catch (error) {
      console.warn(JSON.stringify({
        event: "guest_realtime_unavailable", requestId,
        reason: error instanceof Error ? error.name : "unknown",
      }));
      return { supported: false, reason: "unavailable" };
    }
  });
