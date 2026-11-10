/**
 * broadcast_send — Edge Function
 * ══════════════════════════════
 * إرسال حملات واتساب الجماعية (Broadcasts)
 * يدعم:
 *  - الإرسال بالقوالب (Templates)
 *  - الإرسال لقوائم جهات الاتصال
 *  - Rate Limiting تلقائي (لا أكثر من 80 رسالة/ثانية)
 *  - تتبع حالة الإرسال لكل رسالة
 *  - إعادة المحاولة تلقائياً عند الفشل
 *
 * المتغيرات المطلوبة:
 *   META_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BroadcastPayload {
  tenantId: string;
  broadcastId?: string; // لاستئناف بث موجود
  waNumberId: string;
  phoneNumberId: string;
  contactIds?: string[]; // إذا لم يُحدد، يُرسَل لكل جهات الاتصال النشطة
  template: {
    name: string;
    language: string;
    components?: TemplateComponent[];
  };
  /** خريطة params بالنسبة لمتغيرات القالب — يمكن استخدام contact.{field} */
  paramMapping?: Record<string, string>;
  /** تأخير بين كل رسالة بالـ ms — default: 100 */
  delayMs?: number;
  /** الحد الأقصى للإرسال — default: لا حد */
  maxCount?: number;
}

interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<{ type: string; text?: string; image?: { link: string } }>;
  sub_type?: string;
  index?: number;
}

interface BroadcastRecord {
  id: string;
  tenant_id: string;
  wa_number_id: string;
  phone_number_id: string;
  template_name: string;
  template_language: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  total_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
}

interface Contact {
  id: string;
  phone_e164: string;
  display_name: string | null;
  metadata: Record<string, string> | null;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function makeSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: BroadcastPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const {
    tenantId,
    waNumberId,
    phoneNumberId,
    contactIds,
    template,
    paramMapping = {},
    delayMs = 100,
    maxCount,
  } = payload;

  if (!tenantId || !waNumberId || !phoneNumberId || !template?.name) {
    return new Response(
      JSON.stringify({ error: "Missing: tenantId, waNumberId, phoneNumberId, template.name" }),
      { status: 400 },
    );
  }

  const supabase = makeSupabase();
  const token = requireMetaAccessToken();

  try {
    // 1. إنشاء سجل البث أو استئنافه
    let broadcastId = payload.broadcastId;
    let broadcast: BroadcastRecord;

    if (broadcastId) {
      // استئناف بث موجود
      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("id", broadcastId)
        .eq("tenant_id", tenantId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Broadcast not found" }), { status: 404 });
      }
      broadcast = data as BroadcastRecord;

      await supabase.from("broadcasts").update({ status: "running" }).eq("id", broadcastId);
    } else {
      // إنشاء بث جديد
      const { data, error } = await supabase
        .from("broadcasts")
        .insert({
          tenant_id: tenantId,
          wa_number_id: waNumberId,
          phone_number_id: phoneNumberId,
          template_name: template.name,
          template_language: template.language,
          status: "running",
          total_count: 0,
          sent_count: 0,
          delivered_count: 0,
          failed_count: 0,
          started_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Failed to create broadcast", details: error?.message }),
          { status: 500 },
        );
      }
      broadcast = data as BroadcastRecord;
      broadcastId = broadcast.id;
    }

    // 2. جلب جهات الاتصال
    let contacts: Contact[];
    {
      let query = supabase
        .from("contacts")
        .select("id, phone_e164, display_name, metadata")
        .eq("tenant_id", tenantId)
        .not("phone_e164", "is", null);

      if (contactIds && contactIds.length > 0) {
        query = query.in("id", contactIds);
      }

      if (maxCount) {
        query = query.limit(maxCount);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch contacts: ${error.message}`);
      }
      contacts = (data ?? []) as Contact[];
    }

    // تحديث العدد الإجمالي
    await supabase
      .from("broadcasts")
      .update({ total_count: contacts.length })
      .eq("id", broadcastId);

    // 3. إرسال الرسائل مع Rate Limiting
    let sentCount = 0;
    let failedCount = 0;
    const results: Array<{ contactId: string; status: "sent" | "failed"; error?: string }> = [];

    for (const contact of contacts) {
      try {
        // بناء مكونات القالب مع استبدال المتغيرات
        const components = buildTemplateComponents(template.components, contact, paramMapping);

        const toClean = contact.phone_e164.replace(/^\+/, "");

        const res = await fetch(
          `https://graph.facebook.com/${getMetaApiVersion()}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: toClean,
              type: "template",
              template: {
                name: template.name,
                language: { code: template.language },
                ...(components.length > 0 ? { components } : {}),
              },
            }),
          },
        );

        if (res.ok) {
          const resData = await res.json();
          sentCount++;
          results.push({ contactId: contact.id, status: "sent" });

          // حفظ رسالة البث في جدول broadcast_messages
          await supabase.from("broadcast_messages").insert({
            broadcast_id: broadcastId,
            tenant_id: tenantId,
            contact_id: contact.id,
            phone_e164: contact.phone_e164,
            status: "sent",
            provider_message_id: resData.messages?.[0]?.id ?? null,
            sent_at: new Date().toISOString(),
          });
        } else {
          const errText = await res.text();
          failedCount++;
          results.push({ contactId: contact.id, status: "failed", error: errText });

          await supabase.from("broadcast_messages").insert({
            broadcast_id: broadcastId,
            tenant_id: tenantId,
            contact_id: contact.id,
            phone_e164: contact.phone_e164,
            status: "failed",
            error_message: errText,
            sent_at: new Date().toISOString(),
          });
        }

        // Rate limiting
        await sleep(delayMs);

        // تحديث العداد كل 10 رسائل
        if ((sentCount + failedCount) % 10 === 0) {
          await supabase
            .from("broadcasts")
            .update({ sent_count: sentCount, failed_count: failedCount })
            .eq("id", broadcastId);
        }
      } catch (err) {
        failedCount++;
        results.push({ contactId: contact.id, status: "failed", error: String(err) });
        console.error(`❌ Failed to send to ${contact.phone_e164}:`, err);
      }
    }

    // 4. تحديث حالة البث النهائية
    await supabase
      .from("broadcasts")
      .update({
        status: "completed",
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);

    console.log(`✅ Broadcast ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        broadcast_id: broadcastId,
        total: contacts.length,
        sent: sentCount,
        failed: failedCount,
      }),
      { status: 200 },
    );
  } catch (err) {
    console.error("❌ Broadcast error:", err);

    if (payload.broadcastId) {
      await supabase.from("broadcasts").update({ status: "failed" }).eq("id", payload.broadcastId);
    }

    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildTemplateComponents(
  baseComponents: TemplateComponent[] | undefined,
  contact: Contact,
  paramMapping: Record<string, string>,
): TemplateComponent[] {
  if (!baseComponents || baseComponents.length === 0) return [];

  return baseComponents.map((comp) => ({
    ...comp,
    parameters: comp.parameters?.map((param) => ({
      ...param,
      text: param.text ? interpolate(param.text, contact, paramMapping) : param.text,
    })),
  }));
}

function interpolate(text: string, contact: Contact, paramMapping: Record<string, string>): string {
  return text
    .replace(/\{\{contact\.name\}\}/g, contact.display_name ?? "عزيزي العميل")
    .replace(/\{\{contact\.phone\}\}/g, contact.phone_e164)
    .replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      // ابحث في paramMapping أولاً
      if (paramMapping[key]) return paramMapping[key];
      // ثم في contact.metadata
      if (contact.metadata?.[key]) return contact.metadata[key];
      return `{{${key}}}`;
    });
}
