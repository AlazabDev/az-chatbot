import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

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

    const { tenant_id, wa_account_id } = await req.json();
    if (!tenant_id || !wa_account_id) {
      return json({ error: "tenant_id and wa_account_id are required" }, 400);
    }

    // Check role >= operator
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      return json({ error: "Forbidden" }, 403);
    }

    // Get wa_account
    const { data: account } = await serviceClient
      .from("wa_accounts")
      .select("waba_id")
      .eq("id", wa_account_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (!account) return json({ error: "WA Account not found" }, 404);

    const waAccessToken = requireMetaAccessToken();
    const apiVersion = getMetaApiVersion();

    // Fetch templates from WhatsApp Business API
    const waResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${account.waba_id}/message_templates?limit=250`,
      {
        headers: { Authorization: `Bearer ${waAccessToken}` },
      },
    );

    const waResult = await waResponse.json();
    if (!waResponse.ok) {
      return json({ error: "Failed to fetch templates", details: waResult.error }, 502);
    }

    const templates = waResult.data || [];
    let synced = 0;

    const categoryMap: Record<string, string> = {
      UTILITY: "UTILITY",
      MARKETING: "MARKETING",
      AUTHENTICATION: "AUTH",
    };

    for (const t of templates) {
      const category = categoryMap[t.category] || "UTILITY";
      const component = t.components?.find((c: any) => c.type === "BODY");
      const bodyText = component?.text || "";
      const variables = component?.example?.body_text?.[0] || [];

      await serviceClient.from("templates").upsert(
        {
          tenant_id,
          wa_account_id,
          name: t.name,
          category,
          language: t.language,
          status: t.status,
          body: bodyText,
          variables: variables,
          meta: { id: t.id, components: t.components },
        },
        { onConflict: "tenant_id,wa_account_id,name,language" },
      );
      synced++;
    }

    // Audit
    await serviceClient.from("audit_logs").insert({
      tenant_id,
      user_id: user.id,
      action: "TEMPLATES_SYNC",
      entity: "templates",
      meta: { wa_account_id, synced_count: synced },
    });

    return json({ success: true, synced });
  } catch (err) {
    console.error("templates_sync error:", err);
    return json({ error: err.message }, 500);
  }
});
