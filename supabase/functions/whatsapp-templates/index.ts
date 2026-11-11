// Submit WhatsApp message templates to Meta for approval, sync statuses, delete.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GRAPH = "https://graph.facebook.com/v21.0";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.slice(7));
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const templateId = typeof body.template_id === "string" ? body.template_id : null;
    const accountId = typeof body.account_id === "string" ? body.account_id : null;
    if (!["submit", "sync", "delete"].includes(action)) return json({ error: "invalid action" }, 400);

    let tpl: Record<string, any> | null = null;
    if (templateId) {
      const { data } = await admin.from("message_templates").select("*").eq("id", templateId).eq("user_id", userId).maybeSingle();
      if (!data) return json({ error: "القالب غير موجود" }, 404);
      tpl = data;
    }
    const accId = tpl?.account_id ?? accountId;
    if (!accId) return json({ error: "اختر رقم واتساب مرتبطاً بالقالب" }, 400);
    const { data: acc } = await admin.from("whatsapp_accounts").select("id,waba_id").eq("id", accId).eq("user_id", userId).maybeSingle();
    if (!acc) return json({ error: "الرقم غير موجود" }, 404);
    if (!acc.waba_id) return json({ error: "أضف معرّف حساب واتساب للأعمال (WABA ID) لهذا الرقم" }, 400);
    const { data: sec } = await admin.from("whatsapp_account_secrets").select("access_token").eq("account_id", acc.id).maybeSingle();
    const token = sec?.access_token ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (!token) return json({ error: "توكن ميتا غير مُعد على الخادم" }, 400);
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    if (action === "submit") {
      if (!tpl) return json({ error: "template_id مطلوب" }, 400);
      const res = await fetch(`${GRAPH}/${acc.waba_id}/message_templates`, {
        method: "POST", headers: H,
        body: JSON.stringify({ name: tpl.name, language: tpl.language, category: tpl.category, components: tpl.components }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = out?.error?.error_user_msg ?? out?.error?.message ?? "رفضت ميتا الطلب";
        await admin.from("message_templates").update({ status: "ERROR", rejection_reason: msg }).eq("id", tpl.id);
        return json({ error: msg, status: res.status, details: out }, 400);
      }
      await admin.from("message_templates").update({
        status: out.status ?? "PENDING", meta_template_id: out.id, rejection_reason: null, submitted_at: new Date().toISOString(),
      }).eq("id", tpl.id);
      return json({ ok: true, status: out.status ?? "PENDING" });
    }

    if (action === "sync") {
      const res = await fetch(`${GRAPH}/${acc.waba_id}/message_templates?fields=id,name,language,status,rejected_reason&limit=200`, { headers: H });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: out?.error?.message ?? "تعذرت المزامنة", details: out }, 400);
      const { data: local } = await admin.from("message_templates").select("id,name,language").eq("user_id", userId).eq("account_id", acc.id);
      let updated = 0;
      for (const t of local ?? []) {
        const remote = (out.data ?? []).find((r: any) => r.name === t.name && r.language === t.language);
        if (!remote) continue;
        await admin.from("message_templates").update({
          status: remote.status, meta_template_id: remote.id,
          rejection_reason: remote.rejected_reason && remote.rejected_reason !== "NONE" ? remote.rejected_reason : null,
        }).eq("id", t.id);
        updated++;
      }
      return json({ ok: true, updated });
    }

    // delete
    if (!tpl) return json({ error: "template_id مطلوب" }, 400);
    if (tpl.meta_template_id) {
      const res = await fetch(`${GRAPH}/${acc.waba_id}/message_templates?name=${encodeURIComponent(tpl.name)}`, { method: "DELETE", headers: H });
      if (!res.ok) { const out = await res.json().catch(() => ({})); return json({ error: out?.error?.message ?? "تعذر الحذف من ميتا" }, 400); }
    }
    await admin.from("message_templates").delete().eq("id", tpl.id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }, 500);
  }
});
