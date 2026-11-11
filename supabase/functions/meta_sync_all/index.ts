import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  getMetaApiVersion,
  normalizePhoneE164,
  requireMetaAccessToken,
  requireMetaBusinessId,
} from "../_shared/meta-env.ts";

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

const categoryMap: Record<string, string> = {
  UTILITY: "UTILITY",
  MARKETING: "MARKETING",
  AUTHENTICATION: "AUTH",
};

function mapPhoneStatus(status?: string | null) {
  switch ((status || "").toUpperCase()) {
    case "PENDING":
      return "pending";
    case "DISCONNECTED":
      return "disconnected";
    case "CONNECTED":
    case "LIVE":
    default:
      return "active";
  }
}

function mapPhoneType(accountMode?: string | null) {
  return (accountMode || "").toUpperCase() === "SANDBOX" ? "sandbox" : "connected";
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

    const { tenant_id } = await req.json();
    if (!tenant_id) return json({ error: "tenant_id is required" }, 400);

    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role === "viewer") {
      return json({ error: "Forbidden" }, 403);
    }

    const waAccessToken = requireMetaAccessToken();
    const apiVersion = getMetaApiVersion();
    const businessId = requireMetaBusinessId();
    const API = `https://graph.facebook.com/${apiVersion}`;

    const metaFetch = async (path: string) => {
      const url = path.startsWith("http") ? path : `${API}/${path}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${waAccessToken}` },
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message || `Meta request failed: ${url}`);
      }
      return body;
    };

    const businessInfo = await metaFetch(
      `${businessId}?fields=id,name,verification_status,created_time`,
    );
    const wabasRes = await metaFetch(`${businessId}/owned_whatsapp_business_accounts?limit=100`);
    const wabas = wabasRes.data || [];

    const results = {
      success: true,
      business_id: businessInfo.id,
      business_name: businessInfo.name,
      wabas_synced: 0,
      numbers_synced: 0,
      templates_synced: 0,
      active_numbers: 0,
      pending_numbers: 0,
      disconnected_numbers: 0,
      warnings: [] as string[],
      errors: [] as string[],
    };

    for (const waba of wabas) {
      try {
        const [wabaInfo, phonesRes, templatesRes, appsRes, webhooksRes] = await Promise.all([
          metaFetch(`${waba.id}?fields=id,name,currency,timezone_id,message_template_namespace`),
          metaFetch(`${waba.id}/phone_numbers?limit=100`),
          metaFetch(`${waba.id}/message_templates?limit=250`),
          metaFetch(`${waba.id}/subscribed_apps`),
          metaFetch(`${waba.id}/webhooks`).catch(() => ({ data: [] })),
        ]);

        const appBindings = (appsRes.data || [])
          .map((item: any) => item.whatsapp_business_api_data || item)
          .filter(Boolean);
        const webhookSubscriptions = webhooksRes.data || [];

        const { data: upsertedAccount, error: accErr } = await serviceClient
          .from("wa_accounts")
          .upsert(
            {
              tenant_id,
              waba_id: waba.id,
              label: wabaInfo.name || `WABA ${waba.id}`,
              business_manager_id: businessInfo.id,
              business_name: businessInfo.name,
              currency: wabaInfo.currency || null,
              timezone_id: String(wabaInfo.timezone_id || ""),
              template_namespace: wabaInfo.message_template_namespace || null,
              app_bindings: appBindings,
              webhook_subscriptions: webhookSubscriptions,
              meta: {
                verification_status: businessInfo.verification_status || null,
                created_time: businessInfo.created_time || null,
              },
            },
            { onConflict: "tenant_id,waba_id" },
          )
          .select("id")
          .single();

        if (accErr || !upsertedAccount) {
          results.errors.push(`WABA ${waba.id}: ${accErr?.message || "upsert failed"}`);
          continue;
        }

        const waAccountId = upsertedAccount.id;
        results.wabas_synced++;

        for (const phone of phonesRes.data || []) {
          try {
            const phoneDetail = await metaFetch(
              `${phone.id}?fields=id,display_phone_number,verified_name,quality_rating,status,account_mode,platform_type,throughput`,
            );

            const status = mapPhoneStatus(phoneDetail.status);
            const type = mapPhoneType(phoneDetail.account_mode);
            const phoneE164 =
              normalizePhoneE164(
                phoneDetail.display_phone_number ||
                  phone.display_phone_number ||
                  phoneDetail.verified_name,
              ) || `+${phone.id}`;

            const { error: numErr } = await serviceClient.from("wa_numbers").upsert(
              {
                tenant_id,
                wa_account_id: waAccountId,
                phone_e164: phoneE164,
                display_phone_number: phoneDetail.display_phone_number || phoneE164,
                phone_number_id: phone.id,
                verified_name: phoneDetail.verified_name || null,
                quality_rating: phoneDetail.quality_rating || null,
                account_mode: phoneDetail.account_mode || null,
                platform_type: phoneDetail.platform_type || null,
                throughput: phoneDetail.throughput || null,
                status,
                type,
                meta: {
                  source: "meta_sync_all",
                },
              },
              { onConflict: "tenant_id,phone_number_id" },
            );

            if (numErr) {
              results.errors.push(`Phone ${phone.id}: ${numErr.message}`);
              continue;
            }

            results.numbers_synced++;
            if (status === "active") results.active_numbers++;
            if (status === "pending") results.pending_numbers++;
            if (status === "disconnected") results.disconnected_numbers++;
          } catch (phoneErr) {
            results.errors.push(`Phone ${phone.id}: ${String(phoneErr)}`);
          }
        }

        for (const t of templatesRes.data || []) {
          try {
            const category = categoryMap[t.category] || "UTILITY";
            const bodyComp = t.components?.find((c: any) => c.type === "BODY");
            const bodyText = bodyComp?.text || "";

            let variables: any[] = [];
            if (bodyComp?.example?.body_text?.[0]) {
              variables = bodyComp.example.body_text[0];
            } else if (bodyComp?.example?.body_text_named_params) {
              variables = bodyComp.example.body_text_named_params;
            }

            const { error: tplErr } = await serviceClient.from("templates").upsert(
              {
                tenant_id,
                wa_account_id: waAccountId,
                name: t.name,
                category,
                language: t.language,
                status: t.status,
                body: bodyText,
                variables,
                meta: {
                  id: t.id,
                  components: t.components,
                  parameter_format: t.parameter_format,
                  sub_category: t.sub_category,
                  library_template_name: t.library_template_name,
                  previous_category: t.previous_category || null,
                },
              },
              { onConflict: "tenant_id,wa_account_id,name,language" },
            );

            if (tplErr) {
              results.errors.push(`Template ${t.name}: ${tplErr.message}`);
              continue;
            }

            results.templates_synced++;
          } catch (tplErr) {
            results.errors.push(`Template ${t?.name || "unknown"}: ${String(tplErr)}`);
          }
        }

        if (!appBindings.length) {
          results.warnings.push(`WABA ${waba.id} has no subscribed apps`);
        }
      } catch (wabaErr) {
        results.errors.push(`WABA ${waba.id}: ${String(wabaErr)}`);
      }
    }

    await serviceClient.from("audit_logs").insert({
      tenant_id,
      user_id: user.id,
      action: "META_SYNC_ALL",
      entity: "wa_accounts",
      meta: results,
    });

    return json(results);
  } catch (err: any) {
    console.error("meta_sync_all error:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
