import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { foundryRequest } from "@/lib/foundry-transport.server";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKER_START = "\n\n<!-- AZABOT_TRAINING_START -->\n";
const MARKER_END = "\n<!-- AZABOT_TRAINING_END -->";
type Example = { id: string; agent_id: string; question: string; answer: string; created_at: string };

async function requireAdmin(userId: string, supabase: SupabaseClient) {
  const result = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (result.error || result.data !== true) throw new Error("Administrator role required");
}

async function serverDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export const listAgentTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => {
    if (!idPattern.test(input?.agentId || "")) throw new Error("Invalid agent identifier");
    return input;
  })
  .handler(async ({ context, data }): Promise<Example[]> => {
    await requireAdmin(context.userId, context.supabase as unknown as SupabaseClient);
    const db = await serverDb();
    const { data: rows, error } = await db.from("bot_agent_training_examples")
      .select("id,agent_id,question,answer,created_at")
      .eq("agent_id", data.agentId).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error("Training table unavailable; apply the pending SQL migration");
    return rows as Example[];
  });

export const saveAgentTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; question: string; answer: string }) => {
    if (!idPattern.test(input?.agentId || "") ||
      typeof input.question !== "string" || !input.question.trim() ||
      typeof input.answer !== "string" || !input.answer.trim())
      throw new Error("Invalid training example");
    return { agentId: input.agentId, question: input.question.trim().slice(0, 4000),
      answer: input.answer.trim().slice(0, 8000) };
  })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.supabase as unknown as SupabaseClient);
    const db = await serverDb();
    const { error } = await db.from("bot_agent_training_examples").insert({
      agent_id: data.agentId, question: data.question, answer: data.answer,
      created_by: context.userId,
    });
    if (error) throw new Error("تعذر حفظ المثال؛ تحقق من تطبيق Migration");
    return { ok: true };
  });

export const removeAgentTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; id: string }) => {
    if (!idPattern.test(input?.agentId || "") || !idPattern.test(input?.id || ""))
      throw new Error("Invalid training identifier");
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.supabase as unknown as SupabaseClient);
    const db = await serverDb();
    const { error } = await db.from("bot_agent_training_examples").delete()
      .eq("id", data.id).eq("agent_id", data.agentId);
    if (error) throw new Error("تعذر حذف المثال");
    return { ok: true };
  });

interface FoundryVersion {
  name: string;
  version: string;
  description?: string;
  definition: Record<string, unknown> & { kind?: string; instructions?: string };
}

/** Generates an exact preview; no writes to Foundry. */
async function prepareVersion(agentId: string) {
  const db = await serverDb();
  const { data: agent, error } = await db.from("bot_agents")
    .select("id,agent_name,agent_version,provider").eq("id", agentId).eq("provider", "foundry").single();
  if (error || !agent?.agent_name) throw new Error("Foundry agent is not registered");
  const remote = await foundryRequest<FoundryVersion>(
    "/agents/" + encodeURIComponent(agent.agent_name) + "/versions/" +
    encodeURIComponent(agent.agent_version) + "?api-version=v1",
  );
  if (remote.definition?.kind !== "prompt" || typeof remote.definition.instructions !== "string") {
    throw new Error("Only Prompt agents with instructions are supported for training publication");
  }
  const { data: rows, error: readError } = await db.from("bot_agent_training_examples")
    .select("question,answer").eq("agent_id", agentId).order("created_at", { ascending: true }).limit(20);
  if (readError) throw new Error("Training examples cannot be loaded");
  if (!rows?.length) throw new Error("Add a training example before preparing a version");
  const current = remote.definition.instructions;
  const start = current.indexOf(MARKER_START);
  const base = start >= 0 ? current.slice(0, start) : current;
  const training = rows.map((r, i) =>
    `مثال ${i + 1}:\nسؤال: ${r.question}\nالإجابة المعتمدة: ${r.answer}`).join("\n\n");
  const updatedInstructions = base + MARKER_START +
    "اتبع الأمثلة التالية عند الإجابة عن أسئلة مشابهة:\n\n" + training + MARKER_END;
  if (updatedInstructions.length > 30000) throw new Error("Training prompt exceeds 30K characters");
  return {
    agentId, agentName: agent.agent_name as string, baseVersion: agent.agent_version as string,
    definition: { ...remote.definition, instructions: updatedInstructions },
    exampleCount: rows.length as number,
    beforeChars: current.length,
    afterChars: updatedInstructions.length,
    description: remote.description,
  };
}

export const previewAgentTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string }) => {
    if (!idPattern.test(input?.agentId || "")) throw new Error("Invalid agent identifier");
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.supabase as unknown as SupabaseClient);
    const plan = await prepareVersion(data.agentId);
    return { agentName: plan.agentName, baseVersion: plan.baseVersion,
      exampleCount: plan.exampleCount, beforeChars: plan.beforeChars,
      afterChars: plan.afterChars, instructionsPreview: plan.definition.instructions };
  });

export const publishAgentTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agentId: string; expectedVersion: string }) => {
    if (!idPattern.test(input?.agentId || "") || !/^\d{1,12}$/.test(input?.expectedVersion || ""))
      throw new Error("Invalid publication parameters");
    return input;
  })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, context.supabase as unknown as SupabaseClient);
    const plan = await prepareVersion(data.agentId);
    if (plan.baseVersion !== data.expectedVersion) throw new Error("Agent version changed; preview again");
    const current = await foundryRequest<{ versions?: { latest?: { version?: string } } }>(
      "/agents/" + encodeURIComponent(plan.agentName) + "?api-version=v1");
    if (current.versions?.latest?.version !== plan.baseVersion)
      throw new Error("Newer Foundry version exists; sync it before publishing training");
    const published = await foundryRequest<{ version: string; status?: string }>(
      "/agents/" + encodeURIComponent(plan.agentName) + "/versions?api-version=v1",
      { method: "POST", body: JSON.stringify({
        definition: plan.definition, description: plan.description || undefined,
      }) },
    );
    if (!published.version) throw new Error("Foundry did not return a new version");
    const db = await serverDb();
    const { data: saved, error } = await db.from("bot_agents")
      .update({ agent_version: published.version })
      .eq("id", data.agentId).eq("agent_version", plan.baseVersion).select("id").maybeSingle();
    if (error || !saved) return { ok: false, publishedVersion: published.version,
      message: "تم إنشاء إصدار Foundry ولكن تعذر تحديث إصدار الوكيل في عزبوت؛ يلزم المزامنة اليدوية." };
    return { ok: true, publishedVersion: published.version,
      message: "تم إنشاء إصدار Foundry جديد وتحديث الإصدار المرتبط في عزبوت." };
  });
