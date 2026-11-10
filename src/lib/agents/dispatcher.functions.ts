import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { AGENTS, classifyIntent, findAgent } from "./registry";

export const listPublicAgents = createServerFn({ method: "GET" }).handler(async () => {
  // Only public presentation fields. Agent prompts and provider credentials never reach the widget.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bot_agents")
    .select("id,name,description,agent_name,is_default")
    .eq("is_active", true)
    .eq("provider", "foundry")
    .eq("public_access" as never, true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("تعذر تحميل الوكلاء المسجلين");
  return (data ?? []).map((a) => ({
    id: a.id,
    slug: (a.agent_name || "azabot").replace(/^az-agent-/, ""),
    name: a.name,
    description: a.description || "",
    isDefault: Boolean(a.is_default),
  }));
});

const inputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  currentAgentId: z.string().max(60).optional(),
  forceAgentId: z.string().max(60).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional()
    .default([]),
});

export const dispatchMessageToAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const forced = findAgent(data.forceAgentId);
    const route = forced
      ? {
          agent: forced,
          switched: forced.id !== data.currentAgentId,
          reason: `تم التحويل إلى ${forced.name} بناءً على اختيارك.`,
        }
      : classifyIntent(data.message, data.currentAgentId);

    const { runAgent } = await import("./az-model-core/engine.server");
    const result = await runAgent(route.agent, data.message, data.history);

    return {
      reply: result.reply,
      activeAgent: { id: route.agent.id, slug: route.agent.slug, name: route.agent.name },
      agentSwitched: route.switched,
      switchReason: route.switched ? ("reason" in route ? route.reason : undefined) : undefined,
      toolExecuted: result.toolExecuted
        ? { name: result.toolExecuted.name, success: result.toolExecuted.success }
        : undefined,
    };
  });
