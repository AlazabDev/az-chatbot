// Test connection health for WA numbers and webhook configuration.
// Returns per-number status by calling Meta Graph API.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") ?? Deno.env.get("WA_TOKEN") ?? "";
const WA_VERSION = Deno.env.get("WA_API_VERSION") ?? "v21.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.claims.sub;

  // Get user's tenant numbers
  const { data: tm } = await admin.from("tenant_members").select("tenant_id").eq("user_id", userId);
  const tenantIds = (tm ?? []).map((t) => t.tenant_id);
  const { data: numbers } = await admin
    .from("wa_numbers")
    .select("id, phone_e164, display_phone_number, verified_name, phone_number_id, status")
    .in("tenant_id", tenantIds);

  const envStatus = {
    WA_ACCESS_TOKEN: !!Deno.env.get("WA_ACCESS_TOKEN") || !!Deno.env.get("WA_TOKEN"),
    WA_API_VERSION: !!Deno.env.get("WA_API_VERSION"),
    WA_APP_SECRET: !!Deno.env.get("WA_APP_SECRET"),
    WA_WEBHOOK_VERIFY_TOKEN: !!Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN"),
    WA_PHONE_NUMBER_ID: !!Deno.env.get("WA_PHONE_NUMBER_ID"),
    WA_WABA_ID: !!Deno.env.get("WA_WABA_ID"),
  };

  // Test each number against Meta
  const results = await Promise.all(
    (numbers ?? []).map(async (n) => {
      const startedAt = Date.now();
      try {
        const r = await fetch(
          `https://graph.facebook.com/${WA_VERSION}/${n.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
          { headers: { Authorization: `Bearer ${WA_TOKEN}` } },
        );
        const json = await r.json();
        const elapsed = Date.now() - startedAt;
        if (!r.ok) {
          return {
            id: n.id,
            phone: n.display_phone_number || n.phone_e164,
            phone_number_id: n.phone_number_id,
            ok: false,
            error: json?.error?.message || `HTTP ${r.status}`,
            code: json?.error?.code,
            latency_ms: elapsed,
          };
        }
        // Refresh DB metadata
        await admin
          .from("wa_numbers")
          .update({
            verified_name: json.verified_name ?? n.verified_name,
            display_phone_number: json.display_phone_number ?? n.display_phone_number,
            quality_rating: json.quality_rating ?? null,
            platform_type: json.platform_type ?? null,
            last_active_at: new Date().toISOString(),
          })
          .eq("id", n.id);
        return {
          id: n.id,
          phone: json.display_phone_number || n.phone_e164,
          phone_number_id: n.phone_number_id,
          ok: true,
          verified_name: json.verified_name,
          quality: json.quality_rating,
          latency_ms: elapsed,
        };
      } catch (e) {
        return {
          id: n.id,
          phone: n.display_phone_number || n.phone_e164,
          phone_number_id: n.phone_number_id,
          ok: false,
          error: (e as Error).message,
          latency_ms: Date.now() - startedAt,
        };
      }
    }),
  );

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-webhook`;

  return new Response(
    JSON.stringify({
      webhook_url: webhookUrl,
      api_version: WA_VERSION,
      env: envStatus,
      numbers: results,
      summary: {
        total: results.length,
        online: results.filter((r) => r.ok).length,
        offline: results.filter((r) => !r.ok).length,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
