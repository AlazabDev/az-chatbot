/**
 * ai_auto_reply — Edge Function
 * ══════════════════════════════
 * رد تلقائي بالذكاء الاصطناعي على الرسائل الواردة
 * يُستدعى من chatbot_engine عندما لا تنطبق أي قاعدة keyword
 *
 * المتغيرات المطلوبة:
 *   ANTHROPIC_API_KEY
 *   META_TOKEN / WA_ACCESS_TOKEN
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AI_SYSTEM_PROMPT    — (اختياري) تعليمات النظام للـ AI
 *   AI_MAX_TOKENS       — (اختياري) default: 500
 *   AI_MODEL            — (اختياري) default: claude-haiku-4-5-20251001
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getMetaApiVersion,
  requireMetaAccessToken,
  validateRequiredEnv,
} from "../_shared/meta-env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoReplyPayload {
  tenantId: string;
  convId: string;
  messageId: string;
  fromPhone: string;
  phoneNumberId: string;
  userMessage: string;
}

interface ConversationMessage {
  direction: "inbound" | "outbound";
  text: string | null;
  created_at: string;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function makeSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// ─── Fetch Conversation History ───────────────────────────────────────────────

async function getHistory(
  supabase: ReturnType<typeof makeSupabase>,
  tenantId: string,
  convId: string,
  limit = 10,
): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("direction, text, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", convId)
    .not("text", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).reverse() as ConversationMessage[];
}

// ─── Build Claude Messages ────────────────────────────────────────────────────

function buildClaudeMessages(
  history: ConversationMessage[],
  currentMessage: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of history) {
    if (!msg.text) continue;
    // تجاهل الرسالة الحالية (سيتم إضافتها تلقائياً)
    messages.push({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.text,
    });
  }

  // إذا لم يكن آخر رسالة هي الرسالة الحالية، أضفها
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== currentMessage) {
    messages.push({ role: "user", content: currentMessage });
  }

  return messages;
}

// ─── Call Claude API ──────────────────────────────────────────────────────────

async function callClaude(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = Deno.env.get("AI_MODEL") || "claude-haiku-4-5-20251001";
  const maxTokens = parseInt(Deno.env.get("AI_MAX_TOKENS") || "500");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Claude");

  return text.trim();
}

// ─── Send WhatsApp Message ────────────────────────────────────────────────────

async function sendWhatsApp(phoneNumberId: string, to: string, text: string): Promise<string> {
  const token = requireMetaAccessToken();
  const apiVersion = getMetaApiVersion();
  const toClean = to.replace(/^\+/, "");

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
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
      text: { body: text, preview_url: false },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error: ${err}`);
  }

  const data = await res.json();
  return data.messages?.[0]?.id ?? "";
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    validateRequiredEnv(["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

    const payload: AutoReplyPayload = await req.json();
    const { tenantId, convId, messageId, fromPhone, phoneNumberId, userMessage } = payload;

    if (!tenantId || !convId || !messageId || !fromPhone || !phoneNumberId || !userMessage) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabase = makeSupabase();

    // بناء System Prompt
    const systemPrompt =
      Deno.env.get("AI_SYSTEM_PROMPT") ||
      `أنت مساعد ذكي ودود يرد على استفسارات العملاء عبر واتساب.
كن موجزاً ومفيداً. الردود يجب أن تكون قصيرة (2-4 جمل) إلا إذا طُلب تفصيل.
استخدم لغة العميل (عربي أو إنجليزي). لا تكشف عن طبيعتك كذكاء اصطناعي إلا إذا سُئلت مباشرة.`;

    // جلب سياق المحادثة
    const history = await getHistory(supabase, tenantId, convId, 8);
    const messages = buildClaudeMessages(history, userMessage);

    // الحصول على رد Claude
    const aiReply = await callClaude(messages, systemPrompt);

    // إرسال الرد عبر WhatsApp
    const providerMsgId = await sendWhatsApp(phoneNumberId, fromPhone, aiReply);

    // حفظ الرد في قاعدة البيانات
    await supabase.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: convId,
      direction: "outbound",
      status: "sent",
      type: "text",
      text: aiReply,
      is_ai_generated: true,
      provider_message_id: providerMsgId || null,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ AI reply sent to ${fromPhone} in conv ${convId}`);
    return json({ success: true, reply: aiReply });
  } catch (err) {
    console.error("❌ ai_auto_reply error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
