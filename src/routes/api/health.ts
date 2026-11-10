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
