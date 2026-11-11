import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { tenant_id, media_id, action = "view" } = await req.json();
    if (!tenant_id || !media_id) {
      return json({ error: "tenant_id and media_id are required" }, 400);
    }

    // Check membership (viewer+)
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return json({ error: "Forbidden" }, 403);

    // Get media file
    const { data: media } = await serviceClient
      .from("media_files")
      .select("storage_key, storage_bucket, deleted_at, mime")
      .eq("id", media_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!media || media.deleted_at) {
      return json({ error: "Media not found or deleted" }, 404);
    }

    if (!media.storage_key) {
      return json({ error: "Media not yet processed" }, 404);
    }

    // Create signed URL (5 minutes for view, 15 for download)
    const expiresIn = action === "download" ? 900 : 300;
    const { data: signedUrl, error: urlErr } = await serviceClient.storage
      .from(media.storage_bucket)
      .createSignedUrl(media.storage_key, expiresIn, {
        download: action === "download",
      });

    if (urlErr) {
      console.error("Signed URL error:", urlErr);
      return json({ error: "Failed to create signed URL" }, 500);
    }

    return json({
      url: signedUrl.signedUrl,
      expires_in: expiresIn,
      mime: media.mime,
    });
  } catch (err) {
    console.error("media_signed_url error:", err);
    return json({ error: err.message }, 500);
  }
});
