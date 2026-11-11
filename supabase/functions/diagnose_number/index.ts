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

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { tenant_id, phone_number_id } = await req.json();
    if (!tenant_id || !phone_number_id) {
      return json({ error: "tenant_id and phone_number_id are required" }, 400);
    }

    const waAccessToken = requireMetaAccessToken();
    const apiVersion = getMetaApiVersion();

    // Call WhatsApp API to get phone number details
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,platform_type,status,throughput`,
      {
        headers: { Authorization: `Bearer ${waAccessToken}` },
      },
    );

    const data = await res.json();

    if (!res.ok) {
      // Return 200 with error details so the client can handle it gracefully
      return json({
        success: false,
        error: data.error?.message || "WhatsApp API error",
        code: data.error?.code,
        details: data.error,
      });
    }

    return json({ success: true, data });
  } catch (err: any) {
    console.error("diagnose_number error:", err);
    return json({ success: false, error: err.message }, 200);
  }
});
