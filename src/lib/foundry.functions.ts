import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, timingSafeEqual } from "crypto";

/** Azure AI Foundry v1 (conversations + responses) surface. */
const V1_PATH = "/openai/v1";
const REALTIME_API_VERSION = "2025-04-01-preview";

const GENERIC_CHAT_ERROR = "تعذر معالجة الطلب حالياً، يرجى المحاولة لاحقاً.";

interface FoundryAttachment {
  url: string;
  name: string;
  type: string;
}

interface FoundryChatInput {
  threadId?: string | null;
  message: string;
  attachments?: FoundryAttachment[];
  /** Optional bot_agents.id to route the message to a specific agent. */
  agentId?: string | null;
}

export type FoundryRealtimeSessionResult =
  | {
      supported: true;
      client_secret?: { value: string; expires_at: number };
      id?: string;
      webrtc_url?: string;
    }
  | {
      supported: false;
      reason: "realtime_not_configured" | "realtime_not_supported" | "realtime_unavailable";
      status?: number;
    };

function getBase(): string {
  const base = process.env.FOUNDRY_PROJECT_ENDPOINT;
  if (!base) throw new Error("FOUNDRY_PROJECT_ENDPOINT is not configured");
  return base.replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const key = process.env.FOUNDRY_API_KEY;
  if (!key) throw new Error("FOUNDRY_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "api-key": key,
  };
}

function safeAttachmentUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) return null;
    const allowed = new URL(supabaseUrl);

    if (url.protocol !== "https:" || url.host !== allowed.host) return null;
    if (!url.pathname.startsWith("/storage/v1/object/sign/chatbot-uploads/")) return null;

    return url.toString();
  } catch {
    return null;
  }
}

function getSigningSecret(): string {
  const secret =
    process.env.THREAD_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.FOUNDRY_API_KEY;
  if (!secret) throw new Error("Missing signing secret");
  return secret;
}

function signThreadId(threadId: string): string {
  const sig = createHmac("sha256", getSigningSecret()).update(threadId).digest("hex");
  return `${threadId}.${sig}`;
}

function verifyThreadToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!id || !sig) return null;
  const expected = createHmac("sha256", getSigningSecret()).update(id).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? id : null;
  } catch {
    return null;
  }
}

/** Raised when the agent definition requires an end-user Entra token. */
const E_USER_SCOPE = "E_USER_SCOPE";

async function foundryFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getBase()}${V1_PATH}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    // Log server-side; do not leak provider details to the client.
    console.error(`[Foundry] ${res.status} ${path}: ${text.slice(0, 1000)}`);
    if (res.status === 429) throw new Error("E_RATE_LIMIT");
    if (/aml-user-token|\{\{\$userId\}\}/i.test(text)) throw new Error(E_USER_SCOPE);
    throw new Error(GENERIC_CHAT_ERROR);
  }
  return (await res.json()) as T;
}

interface ResponsesResult {
  output_text?: string;
  output?: Array<{
    type?: string;
    phase?: string;
    role?: string;
    name?: string;
    call_id?: string;
    id?: string;
    arguments?: string;
    content?: Array<{ type?: string; text?: string | { value?: string } }>;
  }>;
}

interface MaintenanceExecution {
  name: string;
  result: Record<string, unknown>;
}

interface ToolRunResult {
  response: ResponsesResult;
  executions: MaintenanceExecution[];
}

function extractText(res: ResponsesResult): string {
  if (typeof res.output_text === "string" && res.output_text.trim()) {
    return res.output_text.trim();
  }
  const items = (res.output ?? []).filter((i) => i.role === "assistant" || i.type === "message");
  const finals = items.filter((i) => i.phase === "final_answer");
  const parts: string[] = [];
  for (const item of finals.length ? finals : items) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
      else if (c.text?.value) parts.push(c.text.value);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Runs the Responses call and resolves any maintenance tool calls the agent
 * requests, feeding the results back until it produces a final answer.
 */
async function runWithTools(
  baseBody: Record<string, unknown>,
  firstInput: Array<Record<string, unknown>> | null,
): Promise<ToolRunResult> {
  const { runMaintenanceTool } = await import("@/lib/maintenance.server");
  let input = firstInput;
  let result: ResponsesResult = {};
  const executions: MaintenanceExecution[] = [];

  for (let step = 0; step < 5; step++) {
    const body = { ...baseBody };
    if (input) body.input = input;
    result = await foundryFetch<ResponsesResult>("/responses", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const calls = (result.output ?? []).filter((i) => i.type === "function_call" && i.name);
    if (!calls.length) return { response: result, executions };

    const followUp: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        args = {};
      }
      const out = await runMaintenanceTool(call.name as string, args);
      executions.push({ name: call.name as string, result: out });
      followUp.push({
        type: "function_call_output",
        call_id: call.call_id || call.id,
        output: JSON.stringify(out),
      });
    }
    input = followUp;
  }
  return { response: result, executions };
}

function resultString(result: Record<string, unknown>, key: string): string {
  const value = result[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Maintenance confirmations are rendered from the gateway result itself.
 * This guarantees that request numbers, states and tracking links cannot be
 * omitted or invented by the language model after a successful tool call.
 */
function maintenanceReply(executions: MaintenanceExecution[]): string | null {
  const execution = executions.at(-1);
  if (!execution) return null;
  const { name, result } = execution;
  if (result["ok"] !== true) {
    return resultString(result, "error") || "تعذر تنفيذ طلب الصيانة حالياً.";
  }

  const requestNumber = resultString(result, "request_number");
  const trackingUrl = resultString(result, "track_url");
  const status = resultString(result, "status");
  const stage = resultString(result, "workflow_stage");
  const lines: string[] = [];

  if (name === "create_maintenance_request") {
    lines.push("تم إنشاء طلب الصيانة بنجاح ✅");
    if (requestNumber) lines.push(`رقم الطلب: ${requestNumber}`);
    if (trackingUrl) lines.push(`رابط المتابعة: ${trackingUrl}`);
    if (!requestNumber) lines.push("تم تسجيل الطلب، وسيصلك رقم الطلب عبر وسيلة التواصل المسجلة.");
    return lines.join("\n");
  }

  if (name === "get_maintenance_status") {
    lines.push("تفاصيل طلب الصيانة:");
    if (requestNumber) lines.push(`رقم الطلب: ${requestNumber}`);
    if (status) lines.push(`الحالة: ${status}`);
    if (stage && stage !== status) lines.push(`المرحلة الحالية: ${stage}`);
    if (trackingUrl) lines.push(`رابط المتابعة: ${trackingUrl}`);
    return lines.length > 1
      ? lines.join("\n")
      : "تم العثور على الطلب، لكن تفاصيل حالته غير متاحة حالياً.";
  }

  if (name === "add_maintenance_note") {
    return [
      "تمت إضافة الملاحظة إلى طلب الصيانة ✅",
      requestNumber ? `رقم الطلب: ${requestNumber}` : "",
      trackingUrl ? `رابط المتابعة: ${trackingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (name === "cancel_maintenance_request") {
    return [
      "تم إلغاء طلب الصيانة ✅",
      requestNumber ? `رقم الطلب: ${requestNumber}` : "",
      trackingUrl ? `رابط المتابعة: ${trackingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return null;
}

export const foundryChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FoundryChatInput) => {
    if (!data || typeof data.message !== "string") {
      throw new Error("Invalid input");
    }
    const message = data.message.trim();
    const agentId =
      typeof data.agentId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.agentId)
        ? data.agentId
        : null;

    const attachments = Array.isArray(data.attachments)
      ? data.attachments
          .filter(
            (a) =>
              a &&
              typeof a.url === "string" &&
              safeAttachmentUrl(a.url) !== null &&
              typeof a.name === "string" &&
              typeof a.type === "string",
          )
          .slice(0, 10)
          .map((a) => ({
            url: safeAttachmentUrl(a.url) as string,
            name: a.name.slice(0, 255),
            type: a.type.slice(0, 128),
          }))
      : [];

    if (!message && attachments.length === 0) {
      throw new Error("Invalid input");
    }

    return {
      threadId:
        typeof data.threadId === "string" && data.threadId.length <= 512 ? data.threadId : null,
      agentId,
      message: message.slice(0, 8000),
      attachments,
    } satisfies FoundryChatInput;
  })
  .handler(async ({ data }) => {
    try {
      const { resolveAgent } = await import("@/lib/agents.server");
      const agent = await resolveAgent(data.agentId);
      if (data.agentId && !agent) throw new Error("E_AGENT_UNAVAILABLE");

      const agentName =
        agent?.agent_name || process.env.FOUNDRY_AGENT_NAME || process.env.FOUNDRY_AGENT_ID;
      if (!agentName) throw new Error("FOUNDRY_AGENT_NAME is not configured");
      const agentVersion =
        agent?.agent_version ||
        process.env.FOUNDRY_AGENT_VER ||
        process.env.FOUNDRY_AGENT_VERSION ||
        "1";

      // 1) Build the user message content parts.
      const contentParts: Array<Record<string, unknown>> = [];
      const fileList: string[] = [];
      for (const att of data.attachments ?? []) {
        if (att.type.startsWith("image/")) {
          contentParts.push({ type: "input_image", image_url: att.url });
        } else {
          fileList.push(`- ${att.name}: ${att.url}`);
        }
      }
      const text =
        (data.message || "") + (fileList.length ? `\n\nالمرفقات:\n${fileList.join("\n")}` : "");
      contentParts.unshift({ type: "input_text", text: text || "..." });

      const userItem = {
        type: "message",
        role: "user",
        content: contentParts,
      };

      // 2) Ensure a conversation — verify the caller's signed token or mint a new one.
      let conversationId: string | null = data.threadId ? verifyThreadToken(data.threadId) : null;
      if (!conversationId) {
        const conv = await foundryFetch<{ id: string }>("/conversations", {
          method: "POST",
          body: JSON.stringify({}),
        });
        conversationId = conv.id;
      }

      // 3) Generate the agent response for this conversation.
      const { maintenanceTools, maintenanceToolsAvailable, MAINTENANCE_GUIDANCE } =
        await import("@/lib/maintenance.server");
      const toolsOn = maintenanceToolsAvailable();

      const body: Record<string, unknown> = {
        conversation: conversationId,
        agent_reference: {
          type: "agent_reference",
          name: agentName,
          version: agentVersion,
        },
      };

      // Note: Foundry rejects `instructions`/`temperature` when an agent
      // reference is supplied. It also rejects request-level tools, so any
      // maintenance-capable turn uses the model deployment directly.

      const model = agent?.deployment || process.env.FOUNDRY_MODEL;
      const fallbackBody: Record<string, unknown> | null = model
        ? {
            model,
            conversation: conversationId,
          }
        : null;
      if (fallbackBody) {
        const instructions = [agent?.system_prompt ?? "", toolsOn ? MAINTENANCE_GUIDANCE : ""]
          .filter(Boolean)
          .join("\n\n");
        if (instructions) fallbackBody.instructions = instructions;
        if (toolsOn) fallbackBody.tools = maintenanceTools;
        // `temperature` is unsupported on reasoning-class deployments; skip it.
        if (typeof agent?.max_tokens === "number") {
          fallbackBody.max_output_tokens = agent.max_tokens;
        }
      }

      const startedAt = Date.now();
      let toolRun: ToolRunResult;
      if (toolsOn) {
        if (!fallbackBody) {
          throw new Error("FOUNDRY_MODEL is not configured for maintenance tools");
        }
        toolRun = await runWithTools(fallbackBody, [userItem]);
      } else {
        try {
          toolRun = await runWithTools(body, [userItem]);
        } catch (err) {
          if (!(err instanceof Error) || err.message === "E_RATE_LIMIT" || !fallbackBody) {
            throw err;
          }
          // The agent may require a per-user identity that an API key cannot
          // supply. Fall back to its configured model deployment.
          toolRun = await runWithTools(fallbackBody, [userItem]);
        }
      }

      const directMaintenanceReply = maintenanceReply(toolRun.executions);
      const reply = directMaintenanceReply || extractText(toolRun.response);
      if (!reply) throw new Error("Empty response from Foundry");
      return {
        threadId: signThreadId(conversationId),
        reply,
        agent: agent ? { id: agent.id, name: agent.name } : null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === GENERIC_CHAT_ERROR || err.message === "E_RATE_LIMIT")
      ) {
        throw err;
      }
      console.error("[Foundry] chat error:", err);
      throw new Error(GENERIC_CHAT_ERROR);
    }
  });

/**
 * Mint an ephemeral Realtime session for the browser WebRTC/WS client.
 * Realtime is optional. Unsupported/misconfigured deployments return a safe
 * result so the browser can fall back to the Web Speech API without turning
 * the server function into a 500 response.
 */
export const foundryRealtimeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((_: unknown) => ({}))
  .handler(async (): Promise<FoundryRealtimeSessionResult> => {
    const deployment = process.env.FOUNDRY_REALTIME_DEPLOYMENT;
    if (!deployment) {
      return { supported: false, reason: "realtime_not_configured" };
    }

    try {
      const base = getBase();
      const url = `${base}/openai/realtimeapi/sessions?api-version=${REALTIME_API_VERSION}`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          model: deployment,
          voice: "alloy",
          modalities: ["audio", "text"],
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: { type: "server_vad" },
          instructions:
            "You are Azab Assistant. Respond concisely in the user's language (Arabic or English).",
        }),
      });

      if (!res.ok) {
        const providerMessage = (await res.text()).slice(0, 1000);
        console.warn(`[Foundry] realtime unavailable (${res.status}): ${providerMessage}`);
        return {
          supported: false,
          reason: "realtime_not_supported",
          status: res.status,
        };
      }

      const session = (await res.json()) as {
        client_secret?: { value: string; expires_at: number };
        id?: string;
        webrtc_url?: string;
      };

      if (!session.client_secret?.value || !session.webrtc_url) {
        console.warn("[Foundry] realtime session response is missing WebRTC credentials");
        return { supported: false, reason: "realtime_not_supported" };
      }

      return {
        supported: true,
        ...session,
      };
    } catch (err) {
      console.warn("[Foundry] realtime unavailable; browser fallback will be used:", err);
      return { supported: false, reason: "realtime_unavailable" };
    }
  });
