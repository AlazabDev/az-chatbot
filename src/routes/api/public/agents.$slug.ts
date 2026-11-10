import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(8000),
  visitorId: z.string().uuid(),
  threadId: z.string().max(512).nullable().optional(),
});

function response(data: Record<string, unknown>, status: number, requestId: string, extra: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId, ...extra },
  });
}

/** Same-origin public REST gateway; embeds operate through an iframe on this origin. */
export const Route = createFileRoute("/api/public/agents/$slug")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return new Response(null, { status: 403 });
        }
        return new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Origin": new URL(request.url).origin,
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          Vary: "Origin",
        } });
      },
      POST: async ({ request, params }) => {
        const requestId = crypto.randomUUID();
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return response({ error: "FORBIDDEN_ORIGIN" }, 403, requestId);
        }
        if (Number(request.headers.get("content-length") || 0) > 20_000) {
          return response({ error: "PAYLOAD_TOO_LARGE" }, 413, requestId);
        }
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return response({ error: "INVALID_REQUEST" }, 400, requestId);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: agent, error } = await supabaseAdmin.from("bot_agents")
            .select("id,agent_name,is_default")
            .eq("provider", "foundry").eq("is_active", true)
            .eq("public_access", true).eq("agent_name", params.slug)
            .maybeSingle();
          if (error || !agent) return response({ error: "AGENT_UNAVAILABLE" }, 404, requestId);

          const { executePublicChat } = await import("@/lib/public-chat.server");
          const result = await executePublicChat({
            ...parsed.data,
            agentId: agent.id,
          });
          return response({
            reply: result.reply,
            conversationId: result.threadId,
            threadId: result.threadId,
            agent: result.agent,
            requestId: result.requestId,
            sources: [], actions: [],
          }, 200, requestId);
        } catch (error) {
          const text = error instanceof Error ? error.message : "";
          const limited = text.includes("تجاوز حد");
          console.error(JSON.stringify({ event: "public_chat_failed", requestId, kind: limited ? "rate_limit" : "gateway_error" }));
          return response({ error: limited ? "RATE_LIMITED" : "CHAT_UNAVAILABLE", requestId },
            limited ? 429 : 503, requestId, limited ? { "Retry-After": "60" } : {});
        }
      },
    },
  },
});
