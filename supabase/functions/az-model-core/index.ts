import type { AgentConfig } from "./prompt.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatRequestPayload {
  message: string;
  history?: ChatMessage[];
  metadata?: Record<string, unknown>;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Legacy agent Edge Functions use server credentials for paid AI requests.
 * Require an actual authenticated administrator or an internal service-role caller.
 * An anon/publishable API key alone must never authorize these requests.
 */
async function authorizeAgentCall(req: Request): Promise<number> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return 401;
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return 503;
  if (token === service) return 200;
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anon) return 503;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) return 401;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const role = await admin.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
  return !role.error && role.data === true ? 200 : 403;
}

export async function handleAgentRequest(req: Request, agent: AgentConfig) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const status = await authorizeAgentCall(req);
  if (status !== 200) return jsonResponse({ error: status === 503 ? "Service unavailable" : "Unauthorized" }, status);

  try {
    const { message, history = [], metadata = {} } = (await req.json()) as ChatRequestPayload;

    if (!message || typeof message !== "string" || !message.trim()) {
      return jsonResponse({ error: "حقل الرسالة مطلوب" }, 400);
    }

    if (message.length > 4000 || !Array.isArray(history) || history.length > 20 ||
        history.some((item) => !item || !["user", "assistant"].includes(item.role) ||
          typeof item.content !== "string" || item.content.length > 4000)) {
      return jsonResponse({ error: "Invalid message or conversation history" }, 400);
    }

    const endpoint = Deno.env.get("FOUNDRY_PROJECT_ENDPOINT") || Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const apiKey = Deno.env.get("FOUNDRY_API_KEY") || Deno.env.get("AZURE_OPENAI_API_KEY");
    const deployment = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o";

    if (!endpoint || !apiKey) throw new Error("متغيرات بيئة الذكاء الاصطناعي غير مهيأة.");

    const messages: ChatMessage[] = [
      { role: "system", content: agent.systemPrompt },
      ...history.slice(-8),
      { role: "user", content: message.trim() },
    ];

    const url = `${endpoint.replace(/\/+$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
    const bodyPayload: Record<string, unknown> = {
      messages,
      temperature: agent.temperature ?? 0.3,
    };

    if (agent.tools?.length) {
      bodyPayload.tools = agent.tools;
      bodyPayload.tool_choice = "auto";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify(bodyPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Azure error [${agent.name}]:`, errText);
      throw new Error(`خطأ في معالجة طلب الذكاء الاصطناعي: ${res.status}`);
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const reply = choice?.message?.content || "عذراً، لم أتمكن من استخراج رد مناسب.";

    return jsonResponse({
      success: true,
      agent: { name: agent.name, role: agent.role },
      reply,
      tool_calls: choice?.message?.tool_calls || null,
      metadata,
    });
  } catch (error) {
    console.error(`Edge function error [${agent.name}]:`, error);
    return jsonResponse({
      success: false,
      agent: agent.name,
      error: error instanceof Error ? error.message : "حدث خطأ داخلي في معالجة الطلب.",
    }, 500);
  }
}
