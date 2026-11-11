import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders, createErrorResponse, createSuccessResponse } from "./utils.ts";
import { GeminiClient } from "./gemini.client.ts";
import { ImageAnalysisCache } from "./cache.service.ts";
import { AnalysisResult, MaintenanceIssueType, UrgencyLevel } from "./types.ts";

// تهيئة Supabase Client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// تهيئة Gemini Client
const geminiClient = new GeminiClient(Deno.env.get("GEMINI_API_KEY")!);
const cacheService = new ImageAnalysisCache(supabase);


/** Sensitive legacy endpoint: only server-to-server calls or verified administrators. */
async function authorizeLegacyInvocation(req: Request): Promise<Response | null> {
  if (req.method === "OPTIONS") return null;
  const raw = req.headers.get("Authorization") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceRole && raw === `Bearer ${serviceRole}`) return null;
  if (!raw.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!base || !anonKey) return new Response("Unauthorized", { status: 401 });
  const userClient = createClient(base, anonKey, { auth: { persistSession: false } });
  const { data: identity, error } = await userClient.auth.getUser(raw.slice(7));
  if (error || !identity.user || identity.user.is_anonymous)
    return new Response("Unauthorized", { status: 401 });
  const { data: allowed, error: roleError } = await userClient.rpc("has_role", {
    _user_id: identity.user.id, _role: "admin",
  });
  if (roleError || allowed !== true) return new Response("Forbidden", { status: 403 });
  return null;
}

Deno.serve(async (req: Request) => {
  const authorization = await authorizeLegacyInvocation(req);
  if (authorization) return authorization;
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image_url, image_base64, image_buffer, caption, conversation_id, request_id } =
      await req.json();

    // التحقق من وجود صورة
    if (!image_url && !image_base64 && !image_buffer) {
      return createErrorResponse(
        "No image provided. Please provide image_url, image_base64, or image_buffer",
        400,
      );
    }

    // 1. حساب hash للصورة للتخزين المؤقت
    let imageData: string | Uint8Array;
    if (image_url) {
      let source: URL;
      try { source = new URL(String(image_url)); }
      catch { return createErrorResponse("Invalid image URL", 400); }
      const storage = new URL(Deno.env.get("SUPABASE_URL")!);
      if (source.protocol !== "https:" || source.host !== storage.host ||
          !source.pathname.startsWith("/storage/v1/object/") ||
          source.username || source.password) {
        return createErrorResponse("Image source is not approved", 403);
      }
      const response = await fetch(source.toString(), {
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return createErrorResponse("Image download failed", 502);
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 10 * 1024 * 1024) return createErrorResponse("Image exceeds 10 MB", 413);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) return createErrorResponse("Image exceeds 10 MB", 413);
      imageData = new Uint8Array(bytes);
    } else if (image_base64) {
      imageData = image_base64;
    } else {
      imageData = new Uint8Array(JSON.parse(image_buffer));
    }

    const imageHash = await calculateImageHash(imageData);

    // 2. البحث في cache
    const cachedAnalysis = await cacheService.get(imageHash);
    if (cachedAnalysis) {
      console.log("✅ Analysis found in cache for hash:", imageHash);

      // تسجيل التحليل مع المحادثة إذا كان هناك conversation_id
      if (conversation_id) {
        await saveAnalysisToConversation(conversation_id, cachedAnalysis, request_id);
      }

      return createSuccessResponse({
        from_cache: true,
        analysis: cachedAnalysis,
        image_hash: imageHash,
      });
    }

    // 3. تحليل الصورة باستخدام Gemini
    console.log("🔄 Analyzing image with Gemini...");
    const analysis = await geminiClient.analyzeImage(imageData, caption);

    // 4. تخزين النتيجة في cache
    await cacheService.set(imageHash, analysis);

    // 5. حفظ التحليل في قاعدة البيانات
    if (conversation_id) {
      await saveAnalysisToConversation(conversation_id, analysis, request_id);
    }

    // 6. إرجاع النتيجة
    return createSuccessResponse({
      from_cache: false,
      analysis,
      image_hash: imageHash,
    });
  } catch (error) {
    console.error("❌ Error in ai_image_analyze:", error);
    return createErrorResponse(error.message || "Internal server error", 500);
  }
});

// حساب hash للصورة
async function calculateImageHash(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  let bytes: Uint8Array;

  if (typeof data === "string") {
    bytes = encoder.encode(data);
  } else {
    bytes = data;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// حفظ التحليل في قاعدة البيانات
async function saveAnalysisToConversation(
  conversationId: string,
  analysis: AnalysisResult,
  requestId?: string,
) {
  // تحديث المحادثة بآخر تحليل
  const { error: convError } = await supabase
    .from("conversations")
    .update({
      last_ai_analysis: analysis,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (convError) {
    console.error("Error updating conversation:", convError);
  }

  // إذا كان هناك طلب صيانة، قم بتحديثه
  if (requestId) {
    const { error: reqError } = await supabase
      .from("maintenance_requests")
      .update({
        ai_analysis: analysis,
        issue_type: analysis.issue_type,
        urgency: analysis.urgency,
        description: analysis.description,
      })
      .eq("id", requestId);

    if (reqError) {
      console.error("Error updating maintenance request:", reqError);
    }
  }
}
