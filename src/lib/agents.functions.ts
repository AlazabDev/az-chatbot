import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BotAgent {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  agent_name: string | null;
  agent_version: string;
  deployment: string | null;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
}

const COLUMNS =
  "id,name,description,provider,agent_name,agent_version,deployment,system_prompt,temperature,max_tokens,is_default,is_active,sort_order,updated_at";

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("غير مصرح لك بهذا الإجراء");
}

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("bot_agents")
      .select(COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error("تعذر تحميل قائمة الوكلاء");
    return (data ?? []) as BotAgent[];
  });

interface SaveAgentInput {
  id?: string | null;
  name: string;
  description?: string | null;
  provider: string;
  agent_name?: string | null;
  agent_version?: string;
  deployment?: string | null;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

function clamp(n: number, min: number, max: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const saveAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SaveAgentInput) => {
    if (!data || typeof data.name !== "string" || !data.name.trim()) {
      throw new Error("اسم الوكيل مطلوب");
    }
    const provider = data.provider === "azure-openai" ? "azure-openai" : "foundry";
    return {
      id: typeof data.id === "string" && data.id ? data.id : null,
      name: data.name.trim().slice(0, 120),
      description: (data.description ?? "").toString().slice(0, 500) || null,
      provider,
      agent_name: (data.agent_name ?? "").toString().trim().slice(0, 200) || null,
      agent_version: (data.agent_version ?? "1").toString().trim().slice(0, 20) || "1",
      deployment: (data.deployment ?? "").toString().trim().slice(0, 200) || null,
      system_prompt: (data.system_prompt ?? "").toString().slice(0, 8000),
      temperature: clamp(Number(data.temperature), 0, 2, 0.7),
      max_tokens: Math.round(clamp(Number(data.max_tokens), 64, 16000, 800)),
      is_default: Boolean(data.is_default),
      is_active: data.is_active !== false,
      sort_order: Math.round(clamp(Number(data.sort_order), 0, 999, 0)),
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { id, ...fields } = data;

    if (fields.is_default) {
      await context.supabase
        .from("bot_agents")
        .update({ is_default: false })
        .neq("id", id ?? "00000000-0000-0000-0000-000000000000");
    }

    const res = id
      ? await context.supabase
          .from("bot_agents")
          .update(fields)
          .eq("id", id)
          .select(COLUMNS)
          .single()
      : await context.supabase.from("bot_agents").insert(fields).select(COLUMNS).single();

    if (res.error) throw new Error("تعذر حفظ الوكيل");
    return res.data as BotAgent;
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data || typeof data.id !== "string") throw new Error("معرّف غير صالح");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("bot_agents").delete().eq("id", data.id);
    if (error) throw new Error("تعذر حذف الوكيل");
    return { ok: true };
  });
