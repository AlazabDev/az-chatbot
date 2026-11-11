/** Server-only helpers for resolving bot agent configuration. */

export interface AgentConfig {
  id: string;
  name: string;
  provider: string;
  agent_name: string | null;
  agent_version: string;
  deployment: string | null;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
}

/**
 * Resolves an agent by id (or the default one). Reads through the admin client
 * because bot_agents is admin-only by RLS and the widget is unauthenticated.
 * Returns null when nothing is configured, so callers fall back to env config.
 */
export async function resolveAgent(agentId?: string | null): Promise<AgentConfig | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("bot_agents")
      .select(
        "id,name,provider,agent_name,agent_version,deployment,system_prompt,temperature,max_tokens,is_active",
      )
      .eq("is_active", true)
      .limit(1);

    query = agentId ? query.eq("id", agentId) : query.eq("is_default", true);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data as AgentConfig;
  } catch {
    return null;
  }
}
