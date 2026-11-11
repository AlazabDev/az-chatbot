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

function parseCloudinaryUrl(url: string) {
  const match = url.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
  if (!match) throw new Error("Invalid CLOUDINARY_URL format");
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const cloudinaryUrl = Deno.env.get("CLOUDINARY_URL");
    if (!cloudinaryUrl) return json({ error: "CLOUDINARY_URL not configured" }, 500);

    const { cloudName, apiKey } = parseCloudinaryUrl(cloudinaryUrl);

    // GET - return config for frontend direct upload
    if (req.method === "GET") {
      return json({ cloud_name: cloudName, api_key: apiKey, upload_preset: "ml_default" });
    }

    // POST - save uploaded files metadata
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { tenant_id, files } = await req.json();
    if (!tenant_id || !files?.length) {
      return json({ error: "tenant_id and files[] are required" }, 400);
    }

    // Check membership
    const { data: membership } = await serviceClient
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) return json({ error: "Forbidden" }, 403);
    if (membership.role === "viewer") return json({ error: "Forbidden: operator+ required" }, 403);

    const records = files.map((f: any) => ({
      tenant_id,
      storage_key: f.public_id,
      storage_bucket: "cloudinary",
      kind: detectKind(f.resource_type, f.format),
      mime: f.mime || `${f.resource_type}/${f.format}`,
      size_bytes: f.bytes || null,
      sha256: f.etag || null,
    }));

    const { data, error } = await serviceClient.from("media_files").insert(records).select("id");

    if (error) {
      console.error("Insert error:", error);
      return json({ error: error.message }, 500);
    }

    return json({ saved: data?.length || 0 });
  } catch (err) {
    console.error("cloudinary_ops error:", err);
    return json({ error: err.message }, 500);
  }
});

function detectKind(resourceType: string, format: string): string {
  if (resourceType === "image") return "image";
  if (resourceType === "video") return "video";
  if (resourceType === "raw") {
    if (["mp3", "wav", "ogg", "m4a"].includes(format)) return "audio";
    return "document";
  }
  return "other";
}
