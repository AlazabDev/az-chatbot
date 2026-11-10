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

async function hashKey(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
        const { name, scopes = [] } = body;
        if (!name) return json({ error: "name is required" }, 400);

        // Generate random key
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const plainKey =
          "sk_live_" +
          Array.from(randomBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const keyPrefix = plainKey.substring(0, 12);
        const keyHash = await hashKey(plainKey);

        const { data: apiKey, error: insertErr } = await serviceClient
          .from("api_keys")
          .insert({
            tenant_id,
            name,
            key_prefix: keyPrefix,
            key_hash: keyHash,
            scopes,
          })
          .select("id, name, key_prefix, scopes, created_at")
          .single();

        if (insertErr) return json({ error: insertErr.message }, 500);

        // Return plaintext key ONCE
        return json({
          ...apiKey,
          key: plainKey,
          warning: "This is the only time the full key will be shown. Store it securely.",
        });
      }

      case "list": {
        const { data: keys } = await serviceClient
          .from("api_keys")
          .select("id, name, key_prefix, scopes, last_used_at, disabled_at, created_at")
          .eq("tenant_id", tenant_id)
          .order("created_at", { ascending: false });

        return json({ keys });
      }

      case "disable": {
        const { key_id } = body;
        if (!key_id) return json({ error: "key_id is required" }, 400);

        await serviceClient
          .from("api_keys")
          .update({ disabled_at: new Date().toISOString() })
          .eq("id", key_id)
          .eq("tenant_id", tenant_id);

        return json({ success: true });
      }

      case "rotate": {
        const { key_id } = body;
        if (!key_id) return json({ error: "key_id is required" }, 400);

        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const plainKey =
          "sk_live_" +
          Array.from(randomBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const keyPrefix = plainKey.substring(0, 12);
        const keyHash = await hashKey(plainKey);

        await serviceClient
          .from("api_keys")
          .update({ key_prefix: keyPrefix, key_hash: keyHash, disabled_at: null })
          .eq("id", key_id)
          .eq("tenant_id", tenant_id);

        return json({
          key: plainKey,
          key_prefix: keyPrefix,
          warning: "This is the only time the full key will be shown.",
        });
      }

      case "delete": {
        const { key_id } = body;
        if (!key_id) return json({ error: "key_id is required" }, 400);

        await serviceClient.from("api_keys").delete().eq("id", key_id).eq("tenant_id", tenant_id);

        return json({ success: true });
      }

      default:
        return json({ error: "Unknown action. Use: create, list, disable, rotate, delete" }, 400);
    }
  } catch (err) {
    console.error("api_keys_manage error:", err);
    return json({ error: err.message }, 500);
  }
});
