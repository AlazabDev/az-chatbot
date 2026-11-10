import type { AgentConfig } from "./prompt.ts";

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
  metadata?: Record<string, any>;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleAgentRequest(req: Request, agent: AgentConfig) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { message, history = [], metadata = {} } = (await req.json()) as ChatRequestPayload;

    if (!message || typeof message !== "string" || !message.trim()) {
      return jsonResponse({ error: "حقل الرسالة مطلوب" }, 400);
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
    const bodyPayload: Record<string, any> = {
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
