import { createFileRoute } from "@tanstack/react-router";
import { normalizePublicChatError, publicRestChatSchema } from "@/lib/publicChatContract";

const MAX_BODY_CHARS = 3_300_000;

function reply(body: Record<string, unknown>, status: number, requestId: string, extra: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId, ...extra },
  });
}

/** Public REST uses exactly the same server gateway as the TanStack chat RPC. */
export const Route = createFileRoute("/api/public/agents/$slug")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        const expected = new URL(request.url).origin;
        if (origin && origin !== expected) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Origin": expected,
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          Vary: "Origin",
        } });
      },
      POST: async ({ request, params }) => {
        const requestId = crypto.randomUUID();
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin)
          return reply({ error: "FORBIDDEN_ORIGIN", requestId }, 403, requestId);
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(params.slug))
          return reply({ error: "INVALID_AGENT", requestId }, 400, requestId);
        if (Number(request.headers.get("content-length") || 0) > MAX_BODY_CHARS)
          return reply({ error: "PAYLOAD_TOO_LARGE", requestId }, 413, requestId);
        const raw = await request.text().catch(() => "");
        if (raw.length > MAX_BODY_CHARS)
          return reply({ error: "PAYLOAD_TOO_LARGE", requestId }, 413, requestId);
        let decoded: unknown;
        try { decoded = JSON.parse(raw); }
        catch { return reply({ error: "INVALID_REQUEST", requestId }, 400, requestId); }
        const checked = publicRestChatSchema.safeParse(decoded);
        if (!checked.success) return reply({ error: "INVALID_REQUEST", requestId }, 400, requestId);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: agent, error } = await supabaseAdmin.from("bot_agents")
            .select("id,agent_name")
            .eq("provider", "foundry").eq("is_active", true).eq("public_access", true)
            .in("agent_name", [params.slug, params.slug.startsWith("az-agent-")
              ? params.slug : `az-agent-${params.slug}`]).limit(1).maybeSingle();
          if (error || !agent) return reply({ error: "AGENT_UNAVAILABLE", requestId }, 404, requestId);

          const { executePublicChat } = await import("@/lib/public-chat.server");
          const result = await executePublicChat({ ...checked.data, agentId: agent.id });
          return reply({
            reply: result.reply,
            conversationId: result.threadId,
            threadId: result.threadId,
            agent: result.agent, requestId: result.requestId,
            sources: [], actions: [],
          }, 200, requestId);
        } catch (error) {
          const normalized = normalizePublicChatError(error);
          console.error(JSON.stringify({ event: "public_chat_failed", requestId, category: normalized.code }));
          return reply({ error: normalized.code, requestId }, normalized.status, requestId,
            normalized.status === 429 ? { "Retry-After": "60" } : {});
        }
      },
    },
  },
});
