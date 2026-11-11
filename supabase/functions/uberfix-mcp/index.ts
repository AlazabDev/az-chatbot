/**
 * Alazab UberFix MCP — Supabase Edge Function (v1.0.0)
 * Dedicated MCP tools for the UberFix maintenance-gateway lifecycle API.
 * Auth: MCP_ACCESS_KEY via x-mcp-key / Bearer / ?key=
 * Upstream auth: UBERFIX_API_KEY sent as x-api-key to the maintenance gateway.
 */
const VERSION = "1.0.0";
const GATEWAY_URL = Deno.env.get("UBERFIX_GATEWAY_URL") || "https://zrrffsjbfkphridqyais.supabase.co/functions/v1/maintenance-gateway";

const HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-mcp-key, mcp-session-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
  "Cache-Control": "no-store",
};
const JSON_HEADERS = { ...HEADERS, "Content-Type": "application/json; charset=utf-8" };
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });

const STAGES = ["triaged", "assigned", "scheduled", "in_progress", "inspection", "waiting_parts", "completed", "billed", "paid", "closed"] as const;

const requestRef = {
  request_id: { type: "string", minLength: 1, description: "معرف الطلب (request_id)" },
  request_number: { type: "string", minLength: 1, description: "رقم الطلب (request_number) — بديل عن request_id" },
} as const;

const TOOLS = [
  {
    name: "uberfix_create_request",
    description:
      "إنشاء طلب صيانة جديد في UberFix. المفتاح مقيد بالطلبات التي أنشأها نفسه — لا يمكنه الاستعلام عن طلبات أنشأها عميل آخر.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", minLength: 1, description: "اسم العميل/الفرع (مثال: أحمد عزب - فرع أبوعوف)" },
        client_phone: { type: "string", minLength: 1, description: "هاتف العميل" },
        service_type: { type: "string", minLength: 1, description: "نوع الخدمة (مثال: electrical)" },
        description: { type: "string", minLength: 1, description: "وصف المشكلة" },
        priority: { type: "string", minLength: 1, description: "الأولوية (مثال: high)" },
      },
      required: ["client_name", "client_phone", "service_type", "description", "priority"],
      additionalProperties: false,
    },
  },
  {
    name: "uberfix_get_status",
    description: "الاستعلام عن حالة طلب صيانة بمعرفه (request_id) أو رقمه (request_number).",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", minLength: 1 },
        ...requestRef,
      },
      required: ["client_name"],
      additionalProperties: false,
    },
  },
  {
    name: "uberfix_transition_stage",
    description: `نقل الطلب إلى مرحلة ضمن دورة العمل. المراحل: ${STAGES.join(", ")}. الخادم يرفض الانتقالات غير القانونية.`,
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", minLength: 1 },
        ...requestRef,
        to_stage: { type: "string", enum: [...STAGES], description: "المرحلة المستهدفة" },
        reason: { type: "string", minLength: 1, description: "سبب الانتقال" },
      },
      required: ["client_name", "to_stage", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "uberfix_add_note",
    description: "إضافة ملاحظة على طلب صيانة.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", minLength: 1 },
        ...requestRef,
        note: { type: "string", minLength: 1 },
      },
      required: ["client_name", "note"],
      additionalProperties: false,
    },
  },
  {
    name: "uberfix_cancel",
    description: "إلغاء طلب صيانة مع سبب الإلغاء.",
    inputSchema: {
      type: "object",
      properties: {
        client_name: { type: "string", minLength: 1 },
        ...requestRef,
        reason: { type: "string", minLength: 1 },
      },
      required: ["client_name", "reason"],
      additionalProperties: false,
    },
  },
] as const;

function needString(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

async function callGateway(body: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
  const apiKey = Deno.env.get("UBERFIX_API_KEY");
  if (!apiKey) return { status: 500, data: { error: "Missing UBERFIX_API_KEY" } };
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ channel: "api", ...body }),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await res.text();
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    /* text response */
  }
  return { status: res.status, data };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function invokeTool(name: string, args: Record<string, unknown>) {
  const clientName = needString(args, "client_name");
  if (name !== "uberfix_create_request" && !clientName)
    return { content: [{ type: "text", text: "client_name مطلوب" }], isError: true };
  const requestId = needString(args, "request_id");
  const requestNumber = needString(args, "request_number");

  if (name === "uberfix_create_request") {
    const missing = ["client_name", "client_phone", "service_type", "description", "priority"].filter((k) => !needString(args, k));
    if (missing.length)
      return { content: [{ type: "text", text: `حقول مطلوبة ناقصة: ${missing.join(", ")}` }], isError: true };
    const res = await callGateway({
      client_name: args.client_name,
      client_phone: args.client_phone,
      service_type: args.service_type,
      description: args.description,
      priority: args.priority,
    });
    return { content: [{ type: "text", text: JSON.stringify({ status: res.status, data: res.data }) }], isError: res.status >= 400 };
  }
  if (name === "uberfix_get_status") {
    if (!requestId && !requestNumber)
      return { content: [{ type: "text", text: "مطلوب request_id أو request_number" }], isError: true };
    const res = await callGateway({ action: "get_status", client_name: clientName, ...(requestId ? { request_id: requestId } : { request_number: requestNumber }) });
    return { content: [{ type: "text", text: JSON.stringify({ status: res.status, data: res.data }) }], isError: res.status >= 400 };
  }
  if (name === "uberfix_transition_stage") {
    const toStage = needString(args, "to_stage");
    const reason = needString(args, "reason");
    if (!toStage || !(STAGES as readonly string[]).includes(toStage))
      return { content: [{ type: "text", text: `to_stage مطلوب ويجب أن يكون ضمن: ${STAGES.join(", ")}` }], isError: true };
    if (!reason) return { content: [{ type: "text", text: "reason مطلوب" }], isError: true };
    if (!requestId && !requestNumber)
      return { content: [{ type: "text", text: "مطلوب request_id أو request_number" }], isError: true };
    const res = await callGateway({ action: "transition_stage", client_name: clientName, to_stage: toStage, reason, ...(requestId ? { request_id: requestId } : { request_number: requestNumber }) });
    return { content: [{ type: "text", text: str({ status: res.status, data: res.data }) }], isError: res.status >= 400 };
  }
  if (name === "uberfix_add_note") {
    const note = needString(args, "note");
    if (!note) return { content: [{ type: "text", text: "note مطلوب" }], isError: true };
    if (!requestId && !requestNumber)
      return { content: [{ type: "text", text: "مطلوب request_id أو request_number" }], isError: true };
    const res = await callGateway({ action: "add_note", client_name: clientName, note, ...(requestId ? { request_id: requestId } : { request_number: requestNumber }) });
    return { content: [{ type: "text", text: str({ status: res.status, data: res.data }) }], isError: res.status >= 400 };
  }
  if (name === "uberfix_cancel") {
    const reason = needString(args, "reason");
    if (!reason) return { content: [{ type: "text", text: "reason مطلوب" }], isError: true };
    if (!requestId && !requestNumber)
      return { content: [{ type: "text", text: "مطلوب request_id أو request_number" }], isError: true };
    const res = await callGateway({ action: "cancel", client_name: clientName, reason, ...(requestId ? { request_id: requestId } : { request_number: requestNumber }) });
    return { content: [{ type: "text", text: str({ status: res.status, data: res.data }) }], isError: res.status >= 400 };
  }
  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
}

async function handle(message: unknown): Promise<unknown | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string")
    return rpcError(isObject(message) && message.id !== undefined ? message.id : null, -32600, "Invalid Request");
  if (message.id === undefined) return null;
  const id = message.id;
  if (!(typeof id === "string" || typeof id === "number" || id === null))
    return rpcError(null, -32600, "Invalid Request ID");

  switch (message.method) {
    case "initialize": {
      const requested = isObject(message.params) ? message.params.protocolVersion : undefined;
      const supported = ["2025-03-26", "2024-11-05"];
      const version = typeof requested === "string" && supported.includes(requested) ? requested : "2025-03-26";
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "uberfix-mcp", version },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      if (!isObject(message.params) || typeof message.params.name !== "string")
        return rpcError(id, -32602, "Expected params.name");
      if (message.params.arguments !== undefined && !isObject(message.params.arguments))
        return rpcError(id, -32602, "Expected params.arguments to be an object");
      const name = message.params.name;
      if (!TOOLS.some((tool) => tool.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      return rpcResult(id, await invokeTool(name, isObject(message.params.arguments) ? message.params.arguments : {}));
    }
    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  const expected = Deno.env.get("MCP_ACCESS_KEY");
  const headerKey = request.headers.get("x-mcp-key");
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const urlKey = new URL(request.url).searchParams.get("key");
  if (!expected || (headerKey !== expected && bearer !== expected && urlKey !== expected))
    return response({ error: "Unauthorized" }, 401);

  if (request.method === "GET") {
    return response({
      name: "uberfix-mcp",
      version,
      upstream: GATEWAY_URL,
      tools: TOOLS.map((tool) => tool.name),
      stages: STAGES,
    });
  }
  if (request.method !== "POST") return response({ error: "Method Not Allowed" }, 405);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(rpcError(null, -32700, "Parse error"), 400);
  }

  try {
    if (Array.isArray(payload) && payload.length === 0) return response(rpcError(null, -32600, "Empty batch"), 400);
    const output = Array.isArray(payload)
      ? (await Promise.all(payload.map(handle))).filter((item) => item !== null)
      : await handle(payload);
    if (output === null || (Array.isArray(output) && output.length === 0))
      return new Response(null, { status: 202, headers: HEADERS });
    return response(output);
  } catch (error) {
    console.error("uberfix-mcp handler failure:", error instanceof Error ? error.message : String(error));
    return response(rpcError(null, -32603, "Internal error"), 500);
  }
});
