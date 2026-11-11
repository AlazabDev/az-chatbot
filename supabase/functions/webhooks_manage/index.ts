import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { tenant_id, action } = body;

    if (!tenant_id) return json({ error: "tenant_id is required" }, 400);

    // Admin only
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    switch (action) {
      case "create": {
        const { url, events = [], secret } = body;
        if (!url) return json({ error: "url is required" }, 400);

        let secretHash = null;
        if (secret) {
          const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
          secretHash = Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        }

        const { data: endpoint, error: insertErr } = await serviceClient
          .from("webhook_endpoints")
          .insert({ tenant_id, url, secret_hash: secretHash, events, is_enabled: true })
          .select()
          .single();

        if (insertErr) return json({ error: insertErr.message }, 500);
        return json(endpoint);
      }

      case "list": {
        const { data: endpoints } = await serviceClient
          .from("webhook_endpoints")
          .select("id, url, events, is_enabled, created_at")
          .eq("tenant_id", tenant_id)
          .order("created_at", { ascending: false });

        return json({ endpoints });
      }

      case "update": {
        const { endpoint_id, url, events, is_enabled } = body;
        if (!endpoint_id) return json({ error: "endpoint_id is required" }, 400);

        const updates: Record<string, unknown> = {};
        if (url !== undefined) updates.url = url;
        if (events !== undefined) updates.events = events;
        if (is_enabled !== undefined) updates.is_enabled = is_enabled;

        await serviceClient
          .from("webhook_endpoints")
          .update(updates)
          .eq("id", endpoint_id)
          .eq("tenant_id", tenant_id);

        return json({ success: true });
      }

      case "delete": {
        const { endpoint_id } = body;
        if (!endpoint_id) return json({ error: "endpoint_id is required" }, 400);

        await serviceClient
          .from("webhook_endpoints")
          .delete()
          .eq("id", endpoint_id)
          .eq("tenant_id", tenant_id);

        return json({ success: true });
      }

      case "test": {
        const { endpoint_id } = body;
        if (!endpoint_id) return json({ error: "endpoint_id is required" }, 400);

        const { data: ep } = await serviceClient
          .from("webhook_endpoints")
          .select("url")
          .eq("id", endpoint_id)
          .eq("tenant_id", tenant_id)
          .single();

        if (!ep) return json({ error: "Endpoint not found" }, 404);

        const testPayload = {
          event: "test",
          timestamp: new Date().toISOString(),
          data: { message: "This is a test webhook delivery" },
        };

        try {
          const response = await fetch(ep.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testPayload),
          });

          const statusCode = response.status;
          await response.text(); // consume body

          // Record delivery
          await serviceClient.from("webhook_deliveries").insert({
            tenant_id,
            webhook_endpoint_id: endpoint_id,
            event_type: "test",
            payload: testPayload,
            status_code: statusCode,
            success: statusCode >= 200 && statusCode < 300,
            attempts: 1,
          });

          return json({ success: statusCode >= 200 && statusCode < 300, status_code: statusCode });
        } catch (fetchErr) {
          await serviceClient.from("webhook_deliveries").insert({
            tenant_id,
            webhook_endpoint_id: endpoint_id,
            event_type: "test",
            payload: testPayload,
            success: false,
            attempts: 1,
            last_error: fetchErr.message,
          });

          return json({ success: false, error: fetchErr.message });
        }
      }

      case "deliveries": {
        const { endpoint_id, limit = 20 } = body;
        if (!endpoint_id) return json({ error: "endpoint_id is required" }, 400);

        const { data: deliveries } = await serviceClient
          .from("webhook_deliveries")
          .select("id, event_type, status_code, success, attempts, last_error, created_at")
          .eq("webhook_endpoint_id", endpoint_id)
          .eq("tenant_id", tenant_id)
          .order("created_at", { ascending: false })
          .limit(limit);

        return json({ deliveries });
      }

      default:
        return json(
          { error: "Unknown action. Use: create, list, update, delete, test, deliveries" },
          400,
        );
    }
  } catch (err) {
    console.error("webhooks_manage error:", err);
    return json({ error: err.message }, 500);
  }
});
