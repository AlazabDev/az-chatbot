import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getMetaApiVersion, requireMetaAccessToken } from "../_shared/meta-env.ts";

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

  // Internal function - auth handled by Supabase config (verify_jwt = false)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const supabase = createClient(supabaseUrl, serviceKey);
  const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const batchSize = 10;
  const results: Array<{ job_id: number; job_type: string; status: string; error?: string }> = [];

  try {
    // Lock and fetch pending jobs
    // Using raw update to lock jobs atomically
    const { data: jobs, error: lockErr } = await supabase
      .from("job_queue")
      .select("*")
      .is("locked_at", null)
      .lte("run_after", new Date().toISOString())
      .lt("attempts", 10) // don't exceed max_attempts
      .order("run_after", { ascending: true })
      .limit(batchSize);

    if (lockErr || !jobs?.length) {
      return json({ processed: 0, results: [] });
    }

    // Lock each job
    for (const job of jobs) {
      const { error: updateErr } = await supabase
        .from("job_queue")
        .update({
          locked_at: new Date().toISOString(),
          locked_by: workerId,
          attempts: job.attempts + 1,
        })
        .eq("id", job.id)
        .is("locked_at", null); // ensure not taken by another worker

      if (updateErr) continue;

      try {
        switch (job.job_type) {
          case "WEBHOOK_DELIVERY":
            await processWebhookDelivery(supabase, job);
            break;
          case "MEDIA_PROCESS":
            await processMedia(supabase, job);
            break;
          case "WORKFLOW_RUN":
            await processWorkflow(supabase, job);
            break;
          case "TEMPLATE_SYNC":
            await processTemplateSync(supabase, job);
            break;
          case "SEND_MESSAGE":
            await processSendMessage(supabase, job);
            break;
          default:
            console.log(`Unknown job type: ${job.job_type}`);
        }

        // Job succeeded — remove from queue
        await supabase.from("job_queue").delete().eq("id", job.id);
        results.push({ job_id: job.id, job_type: job.job_type, status: "completed" });
      } catch (jobErr) {
        const error = jobErr instanceof Error ? jobErr.message : String(jobErr);
        console.error(`Job ${job.id} (${job.job_type}) failed:`, error);

        // Calculate backoff: 2^attempts * 30 seconds
        const backoffSeconds = Math.min(Math.pow(2, job.attempts) * 30, 3600);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        if (job.attempts + 1 >= job.max_attempts) {
          // Max attempts reached — remove from queue, log failure
          await supabase.from("job_queue").delete().eq("id", job.id);
          await supabase.from("audit_logs").insert({
            tenant_id: job.tenant_id,
            action: "JOB_FAILED_PERMANENTLY",
            entity: "job_queue",
            meta: { job_type: job.job_type, attempts: job.attempts + 1, last_error: error },
          });
        } else {
          // Unlock and schedule retry
          await supabase
            .from("job_queue")
            .update({
              locked_at: null,
              locked_by: null,
              run_after: nextRetry,
              last_error: error,
            })
            .eq("id", job.id);
        }

        results.push({ job_id: job.id, job_type: job.job_type, status: "failed", error });
      }
    }

    return json({ processed: results.length, results });
  } catch (err) {
    console.error("worker_dispatch error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ========== Job Handlers ==========

async function processWebhookDelivery(supabase: any, job: any) {
  const { webhook_endpoint_id, event_type, payload } = job.payload;

  const { data: ep } = await supabase
    .from("webhook_endpoints")
    .select("url, secret_hash, is_enabled")
    .eq("id", webhook_endpoint_id)
    .single();

  if (!ep || !ep.is_enabled) return;

  const response = await fetch(ep.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: event_type, data: payload, timestamp: new Date().toISOString() }),
  });

  const statusCode = response.status;
  await response.text(); // consume

  await supabase.from("webhook_deliveries").insert({
    tenant_id: job.tenant_id,
    webhook_endpoint_id,
    event_type,
    payload,
    status_code: statusCode,
    success: statusCode >= 200 && statusCode < 300,
    attempts: job.attempts + 1,
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Webhook delivery failed with status ${statusCode}`);
  }
}

async function processMedia(supabase: any, job: any) {
  const { media_id, tenant_id, message_id, mime_type } = job.payload;
  const waAccessToken = requireMetaAccessToken();
  const apiVersion = getMetaApiVersion();

  if (!media_id) throw new Error("No media_id in payload");

  // Get media URL from WhatsApp
  const mediaInfoRes = await fetch(`https://graph.facebook.com/${apiVersion}/${media_id}`, {
    headers: { Authorization: `Bearer ${waAccessToken}` },
  });
  const mediaInfo = await mediaInfoRes.json();

  if (!mediaInfoRes.ok || !mediaInfo.url) {
    throw new Error(`Failed to get media info: ${JSON.stringify(mediaInfo.error || {})}`);
  }

  // Download media
  const mediaRes = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${waAccessToken}` },
  });

  if (!mediaRes.ok) throw new Error(`Failed to download media: ${mediaRes.status}`);

  const mediaBuffer = await mediaRes.arrayBuffer();
  const mediaBytes = new Uint8Array(mediaBuffer);

  // Generate storage key
  const ext = (mediaInfo.mime_type || "application/octet-stream").split("/").pop() || "bin";
  const storageKey = `${tenant_id}/${message_id || "orphan"}/${media_id}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from("wa-media")
    .upload(storageKey, mediaBytes, {
      contentType: mediaInfo.mime_type || "application/octet-stream",
      upsert: true,
    });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  // Compute SHA-256
  const hashBuffer = await crypto.subtle.digest("SHA-256", mediaBytes);
  const sha256 = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Upload to Seafile as well
  const seafileUrl = Deno.env.get("SEAFILE_URL");
  const seafileToken = Deno.env.get("SEAFILE_TOKEN");
  const seafileRepoId = Deno.env.get("SEAFILE_REPO_ID");
  let seafilePath = "";

  if (seafileUrl && seafileToken && seafileRepoId) {
    try {
      const now = new Date();
      const folderPath = `/whatsapp/${tenant_id.substring(0, 8)}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      // Create directories recursively
      const parts = folderPath.split("/").filter(Boolean);
      let currentPath = "";
      for (const part of parts) {
        currentPath += `/${part}`;
        await fetch(
          `${seafileUrl}/api2/repos/${seafileRepoId}/dir/?p=${encodeURIComponent(currentPath)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${seafileToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "operation=mkdir",
          },
        );
      }

      // Get upload link with matching parent_dir
      const uploadLinkRes = await fetch(
        `${seafileUrl}/api2/repos/${seafileRepoId}/upload-link/?p=${encodeURIComponent(folderPath)}`,
        { headers: { Authorization: `Token ${seafileToken}` } },
      );

      if (uploadLinkRes.ok) {
        const uploadUrl = (await uploadLinkRes.text()).replace(/"/g, "");
        const fileName = `${media_id.substring(0, 10)}_${Date.now()}.${ext}`;
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([mediaBytes], { type: mediaInfo.mime_type || "application/octet-stream" }),
          fileName,
        );
        formData.append("parent_dir", folderPath);
        formData.append("replace", "1");

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Token ${seafileToken}` },
          body: formData,
        });

        if (uploadRes.ok) {
          seafilePath = `${folderPath}/${fileName}`;
          console.log(`Seafile upload success: ${seafilePath}`);
        } else {
          console.error("Seafile upload failed:", await uploadRes.text());
        }
      }
    } catch (sfErr) {
      console.error("Seafile upload error:", sfErr);
    }
  }

  // Determine final storage location
  const finalStorageKey = seafilePath || storageKey;
  const finalBucket = seafilePath ? "seafile" : "wa-media";

  // Update media_files record
  const { data: existingMedia } = await supabase
    .from("media_files")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("message_id", message_id)
    .is("storage_key", null)
    .maybeSingle();

  if (existingMedia) {
    await supabase
      .from("media_files")
      .update({
        storage_key: finalStorageKey,
        storage_bucket: finalBucket,
        mime: mediaInfo.mime_type,
        size_bytes: mediaBytes.length,
        sha256,
      })
      .eq("id", existingMedia.id);
  }

  // Update message meta with storage info so frontend can resolve the URL
  const mediaType = (mediaInfo.mime_type || "").startsWith("image/")
    ? "image"
    : (mediaInfo.mime_type || "").startsWith("video/")
      ? "video"
      : (mediaInfo.mime_type || "").startsWith("audio/")
        ? "audio"
        : "document";

  const { data: currentMsg } = await supabase
    .from("messages")
    .select("meta")
    .eq("id", message_id)
    .single();

  if (currentMsg) {
    const updatedMeta = {
      ...(currentMsg.meta || {}),
      media: {
        ...(currentMsg.meta?.media || {}),
        storage_key: storageKey,
        storage_bucket: "wa-media",
        mime: mediaInfo.mime_type,
        type: mediaType,
        media_file_id: existingMedia?.id || null,
      },
    };

    await supabase.from("messages").update({ meta: updatedMeta }).eq("id", message_id);
  }
}

async function processWorkflow(supabase: any, job: any) {
  const { tenant_id, message_id, conversation_id } = job.payload;

  // Get enabled workflows for this tenant
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("is_enabled", true);

  if (!workflows?.length) return;

  // Get the message
  const { data: message } = await supabase
    .from("messages")
    .select("*")
    .eq("id", message_id)
    .single();

  if (!message) return;

  for (const workflow of workflows) {
    const rules = workflow.rules;
    if (!rules?.trigger || !rules?.actions) continue;

    // Check trigger
    if (rules.trigger === "message.inbound" && message.direction !== "inbound") continue;
    if (rules.trigger === "message.failed" && message.status !== "failed") continue;

    // Check conditions
    let conditionsMet = true;
    for (const condition of rules.conditions || []) {
      switch (condition.type) {
        case "contains":
          if (!message.text?.includes(condition.value)) conditionsMet = false;
          break;
        case "has_media":
          if (condition.value && !message.meta?.media) conditionsMet = false;
          break;
      }
    }

    if (!conditionsMet) continue;

    // Execute actions
    const runLog: any[] = [];

    for (const action of rules.actions) {
      try {
        switch (action.type) {
          case "assign_to":
            await supabase
              .from("conversations")
              .update({ assigned_to: action.user_id })
              .eq("id", conversation_id);
            runLog.push({ action: "assign_to", status: "done" });
            break;

          case "add_note":
            await supabase.from("conversation_notes").insert({
              tenant_id,
              conversation_id,
              user_id: action.user_id || "00000000-0000-0000-0000-000000000000",
              note: action.note,
            });
            runLog.push({ action: "add_note", status: "done" });
            break;

          case "auto_reply_text":
            // Enqueue a send message job
            await supabase.from("job_queue").insert({
              tenant_id,
              job_type: "SEND_MESSAGE",
              payload: { tenant_id, conversation_id, text: action.text },
            });
            runLog.push({ action: "auto_reply_text", status: "enqueued" });
            break;

          case "auto_reply_template":
            await supabase.from("job_queue").insert({
              tenant_id,
              job_type: "SEND_MESSAGE",
              payload: {
                tenant_id,
                conversation_id,
                template: {
                  name: action.template_name,
                  language: { code: action.language || "ar" },
                },
              },
            });
            runLog.push({ action: "auto_reply_template", status: "enqueued" });
            break;
        }
      } catch (actionErr) {
        runLog.push({
          action: action.type,
          status: "error",
          error: actionErr instanceof Error ? actionErr.message : String(actionErr),
        });
      }
    }

    // Record workflow run
    await supabase.from("workflow_runs").insert({
      tenant_id,
      workflow_id: workflow.id,
      trigger_event: rules.trigger,
      status: "completed",
      log: runLog,
    });
  }
}

async function processTemplateSync(supabase: any, job: any) {
  const { tenant_id, wa_account_id } = job.payload;
  const waAccessToken = requireMetaAccessToken();
  const apiVersion = getMetaApiVersion();

  const { data: account } = await supabase
    .from("wa_accounts")
    .select("waba_id")
    .eq("id", wa_account_id)
    .single();

  if (!account) throw new Error("WA Account not found");

  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${account.waba_id}/message_templates?limit=250`,
    { headers: { Authorization: `Bearer ${waAccessToken}` } },
  );

  const result = await res.json();
  if (!res.ok) throw new Error(`Templates fetch failed: ${JSON.stringify(result.error || {})}`);

  const categoryMap: Record<string, string> = {
    UTILITY: "UTILITY",
    MARKETING: "MARKETING",
    AUTHENTICATION: "AUTH",
  };

  for (const t of result.data || []) {
    const component = t.components?.find((c: any) => c.type === "BODY");
    await supabase.from("templates").upsert(
      {
        tenant_id,
        wa_account_id,
        name: t.name,
        category: categoryMap[t.category] || "UTILITY",
        language: t.language,
        status: t.status,
        body: component?.text || "",
        variables: component?.example?.body_text?.[0] || [],
        meta: { id: t.id, components: t.components },
      },
      { onConflict: "tenant_id,wa_account_id,name,language" },
    );
  }
}

async function processSendMessage(supabase: any, job: any) {
  const { tenant_id, conversation_id, text, template } = job.payload;
  const waAccessToken = requireMetaAccessToken();
  const apiVersion = getMetaApiVersion();

  const { data: conv } = await supabase
    .from("conversations")
    .select("contact_id, wa_number_id, contacts(phone_e164), wa_numbers(phone_number_id)")
    .eq("id", conversation_id)
    .single();

  if (!conv) throw new Error("Conversation not found");

  const recipientPhone = conv.contacts?.phone_e164?.replace("+", "");
  const phoneNumberId = conv.wa_numbers?.phone_number_id;

  const waPayload: any = { messaging_product: "whatsapp", to: recipientPhone };
  if (template) {
    waPayload.type = "template";
    waPayload.template = template;
  } else if (text) {
    waPayload.type = "text";
    waPayload.text = { body: text };
  } else {
    throw new Error("No text or template in payload");
  }

  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${waAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(waPayload),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(`WhatsApp API error: ${JSON.stringify(result.error || {})}`);

  const providerMessageId = result.messages?.[0]?.id;

  await supabase.from("messages").insert({
    tenant_id,
    conversation_id,
    direction: "outbound",
    status: "sent",
    text: text || null,
    provider_message_id: providerMessageId,
    meta: template ? { template } : {},
  });
}
