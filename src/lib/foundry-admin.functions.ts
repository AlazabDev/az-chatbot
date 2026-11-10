import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { foundryBase, foundryCredentialsPresent, foundryRequest } from "@/lib/foundry-transport.server";

async function assertAdmin(context: { supabase: SupabaseClient; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  });
  if (error || data !== true) throw new Error("غير مصرح لك بإدارة Foundry");
}

export const getFoundrySettingsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin({ ...context, supabase: context.supabase as unknown as SupabaseClient });
    let endpointHost = "";
    try { endpointHost = new URL(foundryBase()).host; } catch { /* not configured */ }
    return {
      endpointConfigured: Boolean(endpointHost),
      endpointHost,
      credentialConfigured: foundryCredentialsPresent(),
      modelConfigured: Boolean(process.env.FOUNDRY_MODEL),
    };
  });

export interface DiscoveredFoundryAgent {
  name: string; description: string; version: string | null;
  status: string;
}

export const discoverFoundryAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoveredFoundryAgent[]> => {
    await assertAdmin({ ...context, supabase: context.supabase as unknown as SupabaseClient });
    const agents: DiscoveredFoundryAgent[] = [];
    const seen = new Set<string>();
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const cursor: string = after ? "&after=" + encodeURIComponent(after) : "";
      const response: {
        data: Array<{ name: string; description?: string; state?: string; versions?: { latest?: { version?: string | number } } }>;
        has_more?: boolean; last_id?: string;
      } = await foundryRequest("/agents?api-version=v1&limit=100" + cursor);
      for (const a of response.data || []) {
        if (!a.name || seen.has(a.name)) continue;
        seen.add(a.name);
        agents.push({
          name: a.name,
          description: a.description || "",
          version: a.versions?.latest?.version == null ? null : String(a.versions.latest.version),
          status: a.state || "unknown",
        });
      }
      if (!response.has_more || !response.last_id || response.last_id === after) break;
      after = response.last_id;
      if (page === 19) throw new Error("Foundry agent list exceeds inspection limit");
    }
    return agents;
  });

/** Real API invocation; HTTP success alone is insufficient. This is a billable request. */
export const testFoundryAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => {
    if (!data || !/^az-agent-[a-z0-9-]{1,50}$/.test(data.name))
      throw new Error("اسم الوكيل غير صالح");
    return { name: data.name };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin({ ...context, supabase: context.supabase as unknown as SupabaseClient });
    const agent = await foundryRequest<{ name: string; state?: string; versions?: { latest?: { version?: string } } }>(
      "/agents/" + encodeURIComponent(data.name) + "?api-version=v1",
    );
    if (agent.name !== data.name || agent.state === "disabled")
      throw new Error("الوكيل غير موجود أو غير نشط");
    const started = Date.now();
    const reply = await foundryRequest<{
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
    }>("/agents/" + encodeURIComponent(data.name) + "/endpoint/protocols/openai/responses?api-version=v1", {
      method: "POST",
      body: JSON.stringify({ input: [{ role: "user", content: "رد بكلمة واحدة فقط: جاهز" }] }),
    });
    const text = reply.output_text || reply.output?.flatMap(x => x.content || []).map(x => x.text || "").join(" ").trim() || "";
    if (!text) throw new Error("Foundry returned an empty response");
    return { ok: true, name: data.name, version: agent.versions?.latest?.version ?? null, latencyMs: Date.now() - started, reply: text.slice(0, 200) };
  });
