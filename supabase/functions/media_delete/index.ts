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

    const { tenant_id, media_id, mode = "soft" } = await req.json();
    if (!tenant_id || !media_id) {
      return json({ error: "tenant_id and media_id are required" }, 400);
    }

    // Check role
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return json({ error: "Forbidden" }, 403);

    if (mode === "hard" && membership.role !== "admin") {
      return json({ error: "Forbidden: admin role required for hard delete" }, 403);
    }

    if (mode === "soft" && membership.role === "viewer") {
      return json({ error: "Forbidden: operator role required" }, 403);
    }

    // Get media file
    const { data: media } = await serviceClient
      .from("media_files")
      .select("id, storage_key, storage_bucket, deleted_at")
      .eq("id", media_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!media) return json({ error: "Media not found" }, 404);

    if (mode === "soft") {
      if (media.deleted_at) return json({ error: "Already deleted" }, 400);

      await serviceClient
        .from("media_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", media_id);

      return json({ success: true, mode: "soft" });
    }

    // Hard delete
    if (media.storage_key) {
      const { error: storageErr } = await serviceClient.storage
        .from(media.storage_bucket)
        .remove([media.storage_key]);

      if (storageErr) {
        console.error("Storage delete error:", storageErr);
      }
    }

    await serviceClient.from("media_files").delete().eq("id", media_id);

    // Audit
    await serviceClient.from("audit_logs").insert({
      tenant_id,
      user_id: user.id,
      action: "MEDIA_HARD_DELETE",
      entity: "media_files",
      entity_id: media_id,
      meta: { storage_key: media.storage_key },
    });

    return json({ success: true, mode: "hard" });
  } catch (err) {
    console.error("media_delete error:", err);
    return json({ error: err.message }, 500);
  }
});
