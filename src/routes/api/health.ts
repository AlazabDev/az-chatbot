import { createFileRoute } from "@tanstack/react-router";

/** Readiness probe; never returns credentials, project identifiers or database rows. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const requestId = crypto.randomUUID();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("bot_agents")
            .select("id", { head: true, count: "exact" })
            .eq("is_active", true).eq("public_access", true);
          if (error) throw new Error("database_unavailable");
          const configured = [
            "FOUNDRY_INPUT_COST_PER_1M_TOKENS",
            "FOUNDRY_OUTPUT_COST_PER_1M_TOKENS",
            "CHAT_DAILY_BUDGET_USD",
          ].every((name) => Number(process.env[name]) > 0);
          const signing = process.env.CHAT_GATEWAY_HASH_SECRET || process.env.THREAD_SIGNING_SECRET;
          if (!configured || !signing || signing.length < 32)
            throw new Error("chat_security_environment_unavailable");
          const { error: budgetError } = await supabaseAdmin.rpc("get_chat_gateway_budget_status");
          if (budgetError) throw new Error("chat_budget_store_unavailable");
          return Response.json({ status: "ok", service: "az-chatbot", requestId }, {
            status: 200,
            headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
          });
        } catch {
          return Response.json({ status: "unavailable", requestId }, {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
          });
        }
      },
    },
  },
});
