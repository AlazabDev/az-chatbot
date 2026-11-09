import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "chatbot-uploads";
const PATH_RE = /^[A-Za-z0-9_.\-/() ]+$/;

/**
 * Mint a short-lived signed URL for a chatbot-uploads object.
 * The bucket has no public SELECT policy, so the client cannot fetch
 * these files directly — every read goes through this endpoint.
 */
export const getChatUploadSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => {
    if (
      !data ||
      typeof data.path !== "string" ||
      data.path.length === 0 ||
      data.path.length > 512
    ) {
      throw new Error("Invalid path");
    }
    if (data.path.includes("..") || !PATH_RE.test(data.path)) {
      throw new Error("Invalid path");
    }
    return { path: data.path };
  })
  .handler(async ({ data, context }) => {
    const ownerPrefix = `${context.userId}/`;
    if (!data.path.startsWith(ownerPrefix)) {
      throw new Response("Forbidden", { status: 403 });
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(data.path, 60 * 60);
      if (error || !signed) {
        console.error("[chatUploads] signed url error:", error);
        throw new Error("تعذر إنشاء رابط الملف");
      }
      return { url: signed.signedUrl };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("تعذر")) throw err;
      console.error("[chatUploads] error:", err);
      throw new Error("تعذر إنشاء رابط الملف");
    }
  });
