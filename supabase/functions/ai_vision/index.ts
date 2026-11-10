/**
 * ai_vision — Edge Function
 * ══════════════════════════
 * تحليل الصور والوثائق بالذكاء الاصطناعي
 * يستخدم Claude Vision لـ:
 *  - قراءة الصور والاستخراج التلقائي
 *  - تحليل وثائق الصيانة والفواتير
 *  - تصنيف الصور وإضافة tags
 *  - استخراج بيانات النماذج
 *
 * المتغيرات المطلوبة:
 *   ANTHROPIC_API_KEY
 *   META_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiVisionPayload {
  tenantId: string;
  messageId: string;
  mediaWaId: string;
  mediaType: "image" | "document" | string;
  /** اختياري — سياق إضافي */
  context?: "maintenance" | "invoice" | "general";
}

interface ExtractionResult {
  summary: string;
  extracted_fields: Record<string, string>;
  entities: string[];
  tags: string[];
  confidence: number;
  raw_text?: string;
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

  let payload: AiVisionPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { tenantId, messageId, mediaWaId, mediaType, context = "general" } = payload;

  if (!tenantId || !messageId || !mediaWaId) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: tenantId, messageId, mediaWaId" }),
      { status: 400 },
    );
  }

  const supabase = makeSupabase();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
    });
  }

  try {
    // 1. تحميل الصورة من Meta API
    console.log(`📸 Processing media: ${mediaWaId} type:${mediaType}`);
    const { imageBase64, mimeType } = await downloadMediaFromMeta(mediaWaId);

    // 2. بناء prompt حسب السياق
    const prompt = buildVisionPrompt(context, mediaType);

    // 3. استدعاء Claude Vision
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("❌ Claude Vision error:", errText);
      await saveExtractionError(supabase, tenantId, messageId, errText);
      return new Response(JSON.stringify({ error: errText }), { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const responseText = claudeData.content?.[0]?.text ?? "{}";

    // 4. تحليل النتيجة
    let extraction: ExtractionResult;
    try {
      // Claude يرد بـ JSON
      const clean = responseText.replace(/```json\n?|\n?```/g, "").trim();
      extraction = JSON.parse(clean);
    } catch {
      // إذا لم يكن JSON، اجعله نصاً عادياً
      extraction = {
        summary: responseText,
        extracted_fields: {},
        entities: [],
        tags: ["unstructured"],
        confidence: 0.5,
        raw_text: responseText,
      };
    }

    // 5. احفظ النتيجة في ai_extractions
    const { data: saved, error: saveErr } = await supabase
      .from("ai_extractions")
      .insert({
        tenant_id: tenantId,
        message_id: messageId,
        status: "completed",
        model_used: "claude-sonnet-4-6",
        summary: extraction.summary,
        extracted_fields: extraction.extracted_fields ?? {},
        entities: extraction.entities ?? [],
        raw_text: extraction.raw_text ?? null,
        confidence: extraction.confidence ?? 0.8,
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saveErr) {
      console.error("❌ Save extraction error:", saveErr.message);
    }

    // 6. إذا كانت صورة، أضف tags للـ media_file
    if (extraction.tags?.length > 0) {
      await supabase
        .from("media_files")
        .update({ ai_tags: extraction.tags })
        .eq("wa_media_id", mediaWaId);
    }

    console.log(
      `✅ AI Vision completed: ${saved?.id} tags:${extraction.tags?.join(",")} conf:${extraction.confidence}`,
    );

    return new Response(JSON.stringify({ success: true, extraction_id: saved?.id, extraction }), {
      status: 200,
    });
  } catch (err) {
    console.error("❌ AI Vision error:", err);
    await saveExtractionError(supabase, tenantId, messageId, String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// ─── downloadMediaFromMeta ────────────────────────────────────────────────────

async function downloadMediaFromMeta(
  mediaId: string,
): Promise<{ imageBase64: string; mimeType: string }> {
  const token = requireMetaAccessToken();

  // الخطوة 1: جلب URL الوسائط
  const infoRes = await fetch(`https://graph.facebook.com/${getMetaApiVersion()}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!infoRes.ok) {
    throw new Error(`Media info error: ${await infoRes.text()}`);
  }

  const info = await infoRes.json();
  const mediaUrl: string = info.url;
  const mimeType: string = info.mime_type ?? "image/jpeg";

  // الخطوة 2: تنزيل الوسائط
  const downloadRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!downloadRes.ok) {
    throw new Error(`Media download error: ${downloadRes.status}`);
  }

  const buffer = await downloadRes.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // تحويل لـ base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);

  return { imageBase64, mimeType };
}

// ─── buildVisionPrompt ────────────────────────────────────────────────────────

function buildVisionPrompt(context: string, mediaType: string): string {
  const isDocument = mediaType === "document";

  const baseInstructions = `
حلّل هذه ${isDocument ? "الوثيقة" : "الصورة"} بدقة.
أجب بـ JSON فقط بدون أي نص خارجه، بالتنسيق التالي:

{
  "summary": "وصف موجز لمحتوى الصورة/الوثيقة (2-3 جمل)",
  "extracted_fields": {
    "field_name": "value"
  },
  "entities": ["كيانات مستخرجة كالأسماء والأرقام والتواريخ"],
  "tags": ["تصنيفات مناسبة"],
  "confidence": 0.0_to_1.0,
  "raw_text": "النص الكامل المستخرج إن وُجد"
}
`;

  const contextInstructions: Record<string, string> = {
    maintenance: `
السياق: طلب صيانة أو تقرير فني.
استخرج:
- extracted_fields: نوع المشكلة، الجهاز المعني، الموقع، رقم الطلب (إن وُجد)
- tags: ["maintenance", "technical", + تصنيفات أخرى مناسبة]
- تحقق إذا كانت الصورة تُظهر عطلاً أو تلفاً أو قطعة غيار`,

    invoice: `
السياق: فاتورة أو إيصال مالي.
استخرج:
- extracted_fields: رقم الفاتورة، التاريخ، المبلغ الإجمالي، اسم العميل، الخدمات المُقدَّمة
- tags: ["invoice", "financial", + تصنيفات أخرى مناسبة]
- استخرج كل الأرقام المالية`,

    general: `
السياق: عام.
استخرج كل المعلومات المرئية المفيدة.
- tags: صنّف الصورة (document, photo, receipt, technical, personal, etc.)`,
  };

  return baseInstructions + (contextInstructions[context] ?? contextInstructions.general);
}

// ─── saveExtractionError ──────────────────────────────────────────────────────

async function saveExtractionError(
  supabase: ReturnType<typeof makeSupabase>,
  tenantId: string,
  messageId: string,
  errorMessage: string,
) {
  await supabase.from("ai_extractions").insert({
    tenant_id: tenantId,
    message_id: messageId,
    status: "failed",
    error_message: errorMessage,
    extracted_fields: {},
    entities: [],
    processed_at: new Date().toISOString(),
  });
}
