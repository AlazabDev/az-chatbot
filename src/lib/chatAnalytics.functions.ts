import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getChatGatewayAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: permissionError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (permissionError || !admin) throw new Response("Forbidden", { status: 403 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, count, error } = await supabaseAdmin.from("chat_gateway_usage")
      .select("agent_id,created_at,latency_ms,input_tokens,output_tokens,estimated_cost_usd", { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("تعذر قراءة إحصاءات بوابة الشات");
    const rows = data ?? [];
    const total = (key: "input_tokens" | "output_tokens" | "estimated_cost_usd") =>
      rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
    const latencies = rows.map((row) => row.latency_ms).sort((a, b) => a - b);
    const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0;
    const perAgent = new Map<string, number>();
    for (const row of rows) perAgent.set(row.agent_id, (perAgent.get(row.agent_id) || 0) + 1);
    return {
      totalRequestsLast7Days: count ?? 0,
      sampledRequests: rows.length,
      inputTokensSampled: total("input_tokens"),
      outputTokensSampled: total("output_tokens"),
      estimatedCostUsdSampled: Number(total("estimated_cost_usd").toFixed(4)),
      p95LatencyMsSampled: p95,
      agents: [...perAgent.entries()].map(([agentId, requests]) => ({ agentId, requests }))
        .sort((a, b) => b.requests - a.requests).slice(0, 10),
    };
  });
