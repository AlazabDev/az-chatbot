// Shared execution engine for every agent (server-only).
import type { AgentDefinition, AgentRunResult, HistoryMessage } from "./types";

const GENERIC_ERROR = "تعذر معالجة الرسالة حالياً، يرجى المحاولة لاحقاً.";

interface ResponsesResult {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    role?: string;
    name?: string;
    call_id?: string;
    id?: string;
    arguments?: string;
    content?: Array<{ text?: string | { value?: string } }>;
  }>;
}

function extractText(res: ResponsesResult): string {
  if (res.output_text?.trim()) return res.output_text.trim();
  const parts: string[] = [];
  for (const item of res.output ?? []) {
    if (item.type !== "message" && item.role !== "assistant") continue;
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
      else if (c.text?.value) parts.push(c.text.value);
    }
  }
  return parts.join("\n").trim();
}

async function foundry(body: Record<string, unknown>): Promise<ResponsesResult> {
  const base = process.env["FOUNDRY_PROJECT_ENDPOINT"]?.replace(/\/+$/, "");
  const key = process.env["FOUNDRY_API_KEY"];
  if (!base || !key) throw new Error("E_NOT_CONFIGURED");
  const res = await fetch(`${base}/openai/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[agents] Foundry ${res.status}: ${(await res.text()).slice(0, 800)}`);
    throw new Error(res.status === 429 ? "E_RATE_LIMIT" : "E_PROVIDER");
  }
  return (await res.json()) as ResponsesResult;
}

function str(r: Record<string, unknown>, k: string): string {
  const v = r[k];
  return typeof v === "string" ? v.trim() : "";
}

/** Build confirmations from gateway data so numbers/links are never invented. */
function toolReply(name: string, r: Record<string, unknown>): string | null {
  if (r["ok"] !== true) return str(r, "error") || null;
  const num = str(r, "request_number");
  const url = str(r, "track_url");
  const status = str(r, "status");
  const stage = str(r, "workflow_stage");
  if (name === "create_maintenance_request") {
    return [
      "تم تسجيل طلب الصيانة بنجاح ✅",
      num && `رقم الطلب: **${num}**`,
      url && `رابط المتابعة: ${url}`,
      "سيتواصل معك الفريق المختص قريباً.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (name === "get_maintenance_status") {
    return (
      [
        num && `الطلب: **${num}**`,
        status && `الحالة: ${status}`,
        stage && `المرحلة: ${stage}`,
        url && `رابط المتابعة: ${url}`,
      ]
        .filter(Boolean)
        .join("\n") || null
    );
  }
  return null;
}

export async function runAgent(
  agent: AgentDefinition,
  message: string,
  history: HistoryMessage[] = [],
): Promise<AgentRunResult> {
  const model = process.env["FOUNDRY_MODEL"];
  if (!model) return { reply: "محرك الذكاء الاصطناعي غير مهيأ حالياً." };

  let tools: Array<Record<string, unknown>> = [];
  let runTool:
    | ((n: string, a: Record<string, unknown>) => Promise<Record<string, unknown>>)
    | null = null;
  if (agent.tools.length) {
    const m = await import("@/lib/maintenance.server");
    if (m.maintenanceToolsAvailable()) {
      tools = m.maintenanceTools.filter((t) => agent.tools.includes(t.name));
      runTool = m.runMaintenanceTool;
    }
  }

  const base: Record<string, unknown> = { model, instructions: agent.prompt };
  if (tools.length) base["tools"] = tools;

  try {
    let result = await foundry({
      ...base,
      input: [...history.slice(-8), { role: "user", content: message }],
    });
    let last: { name: string; result: Record<string, unknown> } | null = null;

    for (let step = 0; step < 4 && runTool; step++) {
      const calls = (result.output ?? []).filter((i) => i.type === "function_call" && i.name);
      if (!calls.length) break;
      const outputs: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          /* ignore */
        }
        const out = await runTool(call.name as string, args);
        last = { name: call.name as string, result: out };
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id || call.id,
          output: JSON.stringify(out),
        });
      }
      result = await foundry({ ...base, previous_response_id: result.id, input: outputs });
    }

    if (last) {
      const fixed = toolReply(last.name, last.result);
      return {
        reply: fixed || extractText(result) || GENERIC_ERROR,
        toolExecuted: { name: last.name, success: last.result["ok"] === true, data: last.result },
      };
    }
    return { reply: extractText(result) || "عذراً، لم أفهم طلبك، هل يمكنك التوضيح؟" };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "E_RATE_LIMIT") return { reply: "الضغط مرتفع حالياً، يرجى المحاولة بعد لحظات." };
    if (code === "E_NOT_CONFIGURED") return { reply: "محرك الذكاء الاصطناعي غير مهيأ حالياً." };
    return { reply: GENERIC_ERROR };
  }
}
