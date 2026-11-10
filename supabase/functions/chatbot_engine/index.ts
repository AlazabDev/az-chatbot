/**
 * chatbot_engine — Edge Function
 * ══════════════════════════════
 * محرك الشات بوت الذكي
 * يُعالج الرسائل الواردة ويُقرر كيفية الرد
 *
 * منطق الرد:
 *  1. تحقق من قواعد chatbot_rules (keyword rules)
 *  2. إذا لا توجد قاعدة → استخدم Claude AI
 *  3. إذا كان في حالة "human_takeover" → لا ترد
 *
 * المتغيرات المطلوبة:
 *   ANTHROPIC_API_KEY
 *   META_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CHATBOT_AI_MODEL  — default: claude-haiku-4-5-20251001
 *   CHATBOT_MAX_TOKENS — default: 500
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatbotPayload {
  tenantId: string;
  convId: string;
  messageId: string;
  waNumberId: string;
  phoneNumberId: string;
  fromPhone: string;
  msgType: string;
  text: string | null;
  mediaWaId: string | null;
}

interface ChatbotRule {
  id: string;
  tenant_id: string;
  wa_number_id: string | null;
  trigger_type: "keyword" | "regex" | "any" | "first_message";
  trigger_value: string | null;
  response_type: "text" | "template" | "human_takeover" | "ai_reply";
  response_text: string | null;
  template_name: string | null;
  template_language: string | null;
  template_params: Record<string, string> | null;
  priority: number;
  is_active: boolean;
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

  let payload: ChatbotPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { tenantId, convId, messageId, waNumberId, phoneNumberId, fromPhone, text } = payload;

  if (!tenantId || !convId) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const supabase = makeSupabase();

  try {
    // 1. تحقق من حالة المحادثة — إذا كانت "human_takeover" لا ترد
    const { data: conv } = await supabase
      .from("conversations")
      .select("status, chatbot_state, assigned_to")
      .eq("id", convId)
      .single();

    if (conv?.chatbot_state === "human_takeover" || conv?.assigned_to) {
      console.log(`⏭️ Skipping chatbot — human takeover active for conv:${convId}`);
      return new Response(JSON.stringify({ skipped: true, reason: "human_takeover" }), {
        status: 200,
      });
    }

    // 2. اجلب قواعد الشات بوت للمستأجر وهذا الرقم
    const { data: rules } = await supabase
      .from("chatbot_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or(`wa_number_id.is.null,wa_number_id.eq.${waNumberId}`)
      .order("priority", { ascending: false });

    const chatbotRules = (rules ?? []) as ChatbotRule[];

    // 3. تحقق إذا كانت أول رسالة في المحادثة
    const { count: msgCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", convId)
      .eq("direction", "inbound");

    const isFirstMessage = (msgCount ?? 0) <= 1;

    // 4. ابحث عن أول قاعدة مطابقة
    const matchedRule = findMatchingRule(chatbotRules, text ?? "", isFirstMessage);

    if (matchedRule) {
      await handleRuleResponse(supabase, matchedRule, payload);
    } else {
      // 5. لا توجد قاعدة → استخدم Claude AI
      await handleAiResponse(supabase, payload, convId);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("❌ Chatbot error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// ─── findMatchingRule ─────────────────────────────────────────────────────────

function findMatchingRule(
  rules: ChatbotRule[],
  text: string,
  isFirstMessage: boolean,
): ChatbotRule | null {
  const normalizedText = text.trim().toLowerCase();

  for (const rule of rules) {
    switch (rule.trigger_type) {
      case "first_message":
        if (isFirstMessage) return rule;
        break;

      case "any":
        return rule;

      case "keyword": {
        const keywords = (rule.trigger_value ?? "").split(",").map((k) => k.trim().toLowerCase());
        if (keywords.some((k) => normalizedText.includes(k))) return rule;
        break;
      }

      case "regex": {
        try {
          const re = new RegExp(rule.trigger_value ?? "", "i");
          if (re.test(normalizedText)) return rule;
        } catch {
          // Ignore bad regex
        }
        break;
      }
    }
  }

  return null;
}

// ─── handleRuleResponse ───────────────────────────────────────────────────────

async function handleRuleResponse(
  supabase: ReturnType<typeof makeSupabase>,
  rule: ChatbotRule,
  payload: ChatbotPayload,
) {
  const { tenantId, convId, phoneNumberId, fromPhone } = payload;

  switch (rule.response_type) {
    case "text": {
      if (rule.response_text) {
        await sendWhatsAppText(phoneNumberId, fromPhone, rule.response_text);
        await saveOutboundMessage(supabase, tenantId, convId, rule.response_text, "text");
      }
      break;
    }

    case "template": {
      if (rule.template_name) {
        await sendWhatsAppTemplate(
          phoneNumberId,
          fromPhone,
          rule.template_name,
          rule.template_language ?? "ar",
          rule.template_params ?? {},
        );
        await saveOutboundMessage(
          supabase,
          tenantId,
          convId,
          `[قالب: ${rule.template_name}]`,
          "template",
        );
      }
      break;
    }

    case "human_takeover": {
      // تحويل المحادثة لإنسان
      await supabase
        .from("conversations")
        .update({ chatbot_state: "human_takeover", status: "pending" })
        .eq("id", convId);

      // رسالة اختيارية قبل التحويل
      if (rule.response_text) {
        await sendWhatsAppText(phoneNumberId, fromPhone, rule.response_text);
        await saveOutboundMessage(supabase, tenantId, convId, rule.response_text, "text");
      }
      break;
    }

    case "ai_reply": {
      // استخدام AI حتى لو كانت هناك قاعدة (للردود الذكية)
      await handleAiResponse(supabase, payload, convId);
      break;
    }
  }
}

// ─── handleAiResponse ─────────────────────────────────────────────────────────

async function handleAiResponse(
  supabase: ReturnType<typeof makeSupabase>,
  payload: ChatbotPayload,
  convId: string,
) {
  const { tenantId, phoneNumberId, fromPhone, text, msgType } = payload;

  if (!text && msgType === "text") return; // لا نرد على رسائل نصية فارغة
  if (!["text", "interactive", "button"].includes(msgType)) {
    // للصور والملفات، نُخبر المستخدم أننا استلمناها
    const ackMsg = "✅ تم استلام ملفك، سيراجعه فريقنا قريباً.";
    await sendWhatsAppText(phoneNumberId, fromPhone, ackMsg);
    await saveOutboundMessage(supabase, tenantId, convId, ackMsg, "text");
    return;
  }

  // اجلب آخر 10 رسائل للسياق
  const { data: history } = await supabase
    .from("messages")
    .select("direction, text, type, timestamp")
    .eq("conversation_id", convId)
    .order("timestamp", { ascending: false })
    .limit(10);

  const historyMessages = (history ?? []).reverse();

  // بناء prompt لـ Claude
  const systemPrompt = await buildSystemPrompt(supabase, tenantId);

  const claudeMessages = historyMessages
    .filter((m) => m.text)
    .map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.text!,
    }));

  // تأكد أن آخر رسالة من المستخدم
  if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
    if (text) {
      claudeMessages.push({ role: "user", content: text });
    }
  }

  if (claudeMessages.length === 0) return;

  // استدعاء Claude API
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY not set");
    return;
  }

  const model = Deno.env.get("CHATBOT_AI_MODEL") ?? "claude-haiku-4-5-20251001";
  const maxTokens = parseInt(Deno.env.get("CHATBOT_MAX_TOKENS") ?? "500");

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: claudeMessages,
    }),
  });

  if (!claudeRes.ok) {
    console.error("❌ Claude API error:", await claudeRes.text());
    return;
  }

  const claudeData = await claudeRes.json();
  const replyText = claudeData.content?.[0]?.text;

  if (!replyText) {
    console.error("❌ No reply from Claude");
    return;
  }

  // أرسل الرد
  await sendWhatsAppText(phoneNumberId, fromPhone, replyText);
  await saveOutboundMessage(supabase, tenantId, convId, replyText, "text", true);

  console.log(`✅ AI reply sent to ${fromPhone}: ${replyText.substring(0, 50)}...`);
}

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

async function buildSystemPrompt(
  supabase: ReturnType<typeof makeSupabase>,
  tenantId: string,
): Promise<string> {
  // اجلب إعدادات الشات بوت من الـ settings
  const { data: settings } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const businessName = settings?.name ?? "الشركة";

  return `أنت مساعد ذكي لخدمة عملاء ${businessName} عبر واتساب.

قواعد مهمة:
- أجب دائماً باللغة العربية إلا إذا كتب المستخدم بلغة أخرى
- اجعل ردودك قصيرة ومفيدة (2-4 جمل كحد أقصى)
- كن ودوداً ومحترفاً
- إذا لم تعرف الإجابة، قل "سأحيلك لأحد زملائي المتخصصين"
- لا تختلق معلومات
- لا تذكر أنك ذكاء اصطناعي إلا إذا سُئلت مباشرة
- ركّز على مجال الخدمة: الصيانة، المواعيد، الطلبات، والدعم الفني

أسلوب الرد:
- ابدأ بالترحيب في أول رسالة
- استخدم الإيموجي باعتدال
- للمواعيد والطلبات، اطلب المعلومات الضرورية فقط`;
}

// ─── sendWhatsAppText ─────────────────────────────────────────────────────────

async function sendWhatsAppText(phoneNumberId: string, to: string, text: string) {
  const token = requireMetaAccessToken();

  // إزالة + من بداية الرقم للـ API
  const toClean = to.replace(/^\+/, "");

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
        type: "text",
        text: { preview_url: false, body: text },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return await res.json();
}

// ─── sendWhatsAppTemplate ─────────────────────────────────────────────────────

async function sendWhatsAppTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  language: string,
  params: Record<string, string>,
) {
  const token = requireMetaAccessToken();

  const toClean = to.replace(/^\+/, "");

  // بناء مكونات القالب
  const components =
    Object.keys(params).length > 0
      ? [
          {
            type: "body",
            parameters: Object.values(params).map((v) => ({ type: "text", text: v })),
          },
        ]
      : [];

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
          name: templateName,
          language: { code: language },
          components,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Template API error: ${err}`);
  }

  return await res.json();
}

// ─── saveOutboundMessage ──────────────────────────────────────────────────────

async function saveOutboundMessage(
  supabase: ReturnType<typeof makeSupabase>,
  tenantId: string,
  convId: string,
  text: string,
  type: string = "text",
  isAiGenerated: boolean = false,
) {
  const { error } = await supabase.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: convId,
    direction: "outbound",
    status: "sent",
    type,
    text,
    is_ai_generated: isAiGenerated,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error("❌ Outbound message save error:", error.message);
  }
}
