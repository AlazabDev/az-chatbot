// Per-agent HTTP endpoint: POST /api/public/agents/<az-agent-id or slug>
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { findAgent } from "@/lib/agents/registry";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional()
    .default([]),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimit = new Map<string, number[]>();

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

async function requireUser(request: Request): Promise<string | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

function allowedByRateLimit(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const current = (rateLimit.get(key) ?? []).filter((ts) => ts > cutoff);

  if (current.length >= RATE_LIMIT_MAX) {
    rateLimit.set(key, current);
    return false;
  }

  current.push(now);
  rateLimit.set(key, current);

  if (rateLimit.size > 10_000) {
    for (const [entryKey, timestamps] of rateLimit) {
      if (!timestamps.some((ts) => ts > cutoff)) rateLimit.delete(entryKey);
      if (rateLimit.size <= 8_000) break;
    }
  }

  return true;
}

export const Route = createFileRoute("/api/public/agents/$slug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request, params }) => {
        const userId = await requireUser(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
        }

        if (!allowedByRateLimit(`${userId}:${params.slug}`)) {
          return Response.json(
            { error: "Too many requests" },
            { status: 429, headers: { ...cors, "Retry-After": "60" } },
          );
        }

        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
          return Response.json({ error: "Request too large" }, { status: 413, headers: cors });
        }

        const agent = findAgent(params.slug);
        if (!agent) {
          return Response.json({ error: "الوكيل غير موجود." }, { status: 404, headers: cors });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "الرسالة مطلوبة." }, { status: 400, headers: cors });
        }

        const { runAgent } = await import("@/lib/agents/az-model-core/engine.server");
        const result = await runAgent(agent, parsed.data.message, parsed.data.history);

        return Response.json(
          {
            agent: { id: agent.id, name: agent.name },
            reply: result.reply,
            toolExecuted: result.toolExecuted
              ? { name: result.toolExecuted.name, success: result.toolExecuted.success }
              : undefined,
          },
          { headers: cors },
        );
      },
    },
  },
});
