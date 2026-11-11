/**
 * Alazab magicplan MCP — Supabase Edge Function (v1.0.0)
 * Streamable HTTP JSON-RPC MCP server for the magicplan Cloud API (41 operations).
 * Auth: MCP_ACCESS_KEY via x-mcp-key / Bearer / ?key=
 * Upstream auth: MAGICPLAN_API_KEY (header `key`) + MAGICPLAN_CUSTOMER_ID (header `customer`).
 */
import catalog from "./catalog.json" with { type: "json" };
import type { Dict, Operation, ToolResult } from "./types.ts";
import { isObject, toolResult } from "./types.ts";
import { callMagicplan } from "./magicplan-client.ts";

const VERSION = "1.0.0";
const OPERATIONS = catalog as Operation[];
const BY_ID = new Map<string, Operation>();
for (const op of OPERATIONS) {
  if (BY_ID.has(op.id)) throw new Error(`Duplicate operation ID: ${op.id}`);
  BY_ID.set(op.id, op);
}

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

const TOOLS = [
  {
    name: "magicplan_list_categories",
    description: "قائمة بأقسام عمليات magicplan (مشاريع، مخططات، فرق، نماذج...) وعدد العمليات في كل قسم.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "magicplan_search_operations",
    description:
      "البحث في عمليات magicplan بالعربية أو الإنجليزية (مثال: 'مشاريع', 'مخطط', 'مشروع', 'project', 'plan', 'form').",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "كلمات البحث بالعربية أو الإنجليزية" },
        category: { type: "string", description: "فلترة بحسب القسم (اختياري)" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
  {
    name: "magicplan_describe_operation",
    description: "معرفة تفاصيل المسار، المعاملات المطلوبة، ونوع العملية بواسطة معرفها.",
    inputSchema: {
      type: "object",
      properties: { operation_id: { type: "string" } },
      required: ["operation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "magicplan_call",
    description:
      "تنفيذ عملية على magicplan مع دعم تقليص الاستجابة (compact) واقتطاع حقول محددة. الكتابة (إنشاء/تعديل/حذف) مفتوحة مباشرة.",
    inputSchema: {
      type: "object",
      properties: {
        operation_id: { type: "string", description: "معرف العملية (مثل get_projects أو post_projects)" },
        path_params: { type: "object", additionalProperties: true },
        query: { type: "object", additionalProperties: true },
        body: { type: "object", additionalProperties: true },
        view: {
          type: "string",
          enum: ["compact", "full"],
          default: "compact",
          description: "'compact' لحذف القيم الفارغة وتوفير التوكنز، أو 'full' للبيانات الخام",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "اقتطاع حقول محددة فقط (مثل: ['id', 'name', 'user_modified'])",
        },
      },
      required: ["operation_id"],
    },
  },
] as const;

const AR_SYNONYMS: Record<string, string[]> = {
  مشاريع: ["project"],
  مشروع: ["project"],
  مخططات: ["plan"],
  مخطط: ["plan"],
  فرق: ["team"],
  فريق: ["team"],
  نماذج: ["form"],
  نموذج: ["form"],
  مستخدمون: ["user"],
  مستخدم: ["user"],
  مساحة: ["workspace"],
  ملفات: ["file"],
  صور: ["image", "svg"],
  تقديرات: ["estimate"],
  تسعيرات: ["estimate"],
  حذف: ["delete"],
  إنشاء: ["post", "create"],
  تعديل: ["put", "update"],
  قائمة: ["list", "get"],
};

function expandSearchTerms(raw: string): string[] {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return [];
  const terms = new Set<string>([normalized]);
  for (const [ar, en] of Object.entries(AR_SYNONYMS)) {
    if (normalized.includes(ar)) for (const t of en) terms.add(t);
  }
  return [...terms];
}

async function invokeTool(name: string, args: Dict): Promise<ToolResult> {
  if (name === "magicplan_list_categories") {
    const counts: Record<string, number> = {};
    for (const op of OPERATIONS) counts[op.t] = (counts[op.t] ?? 0) + 1;
    return toolResult(counts);
  }
  if (name === "magicplan_search_operations") {
    const searchTerms = expandSearchTerms(typeof args.query === "string" ? args.query : "");
    const limitRaw = Number(args.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;
    const results = OPERATIONS.filter((op) => {
      if (args.category && op.t.toLowerCase() !== String(args.category).toLowerCase()) return false;
      if (args.method && op.m !== args.method) return false;
      if (searchTerms.length === 0) return true;
      const haystack = `${op.id} ${op.p} ${op.s} ${op.t} ${op.module}`.toLowerCase();
      return searchTerms.some((term) => haystack.includes(term));
    })
      .slice(0, limit)
      .map((op) => ({ id: op.id, method: op.m, path: op.p, summary: op.s, category: op.t }));
    return toolResult(results);
  }
  if (name === "magicplan_describe_operation") {
    if (typeof args.operation_id !== "string" || !args.operation_id)
      return toolResult("operation_id must be a nonempty string", true);
    const op = BY_ID.get(args.operation_id);
    return op ? toolResult(op) : toolResult("Unknown operation_id", true);
  }
  if (name === "magicplan_call") {
    if (typeof args.operation_id !== "string" || !args.operation_id)
      return toolResult("operation_id must be a nonempty string", true);
    const op = BY_ID.get(args.operation_id);
    if (!op) return toolResult("Unknown operation_id", true);
    return await callMagicplan(op, args);
  }
  return toolResult(`Unknown tool: ${name}`, true);
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
        serverInfo: { name: "magicplan-mcp", version },
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
      name: "magicplan-mcp",
      version: VERSION,
      upstream: "magicplan Cloud API v2",
      operations: OPERATIONS.length,
      modules: [...new Set(OPERATIONS.map((o) => o.module))],
      tools: TOOLS.map((tool) => tool.name),
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
    console.error("magicplan-mcp handler failure:", error instanceof Error ? error.message : String(error));
    return response(rpcError(null, -32603, "Internal error"), 500);
  }
});
