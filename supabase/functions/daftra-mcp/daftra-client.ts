import type { Operation, Dict, ToolResult } from "./types.ts";
import { isObject, toolResult } from "./types.ts";

/**
 * تنظيف البيانات بازالة الحقول الفارغة والـ null لتوفير التوكنز
 */
function pruneNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneNulls).filter((v) => v !== null && v !== undefined);
  }
  if (isObject(value)) {
    const cleaned: Dict = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "") continue;
      // تجاهل الحقول الداخلية التخطيطية غير الضرورية لدفترة
      if (["layout_id", "pos_shift_id", "created_by"].includes(k) && !v) continue;
      cleaned[k] = pruneNulls(v);
    }
    return cleaned;
  }
  return value;
}

/**
 * تقليص الكائن لحقول محددة فقط
 */
function pickFields(item: unknown, fields: string[]): unknown {
  if (!isObject(item)) return item;
  const picked: Dict = {};
  for (const field of fields) {
    if (field in item) picked[field] = item[field];
  }
  return picked;
}

/**
 * تحويل السجل لوضع العرض المختصر (Compact Mode)
 */
function makeCompact(data: unknown, fields?: string[]): unknown {
  const pruned = pruneNulls(data);
  if (fields && fields.length > 0) {
    if (Array.isArray(pruned)) return pruned.map((item) => pickFields(item, fields));
    if (isObject(pruned) && Array.isArray((pruned as Dict).data)) {
      return {
        ...(pruned as Dict),
        data: ((pruned as Dict).data as unknown[]).map((item) => pickFields(item, fields)),
      };
    }
    return pickFields(pruned, fields);
  }
  return pruned;
}

function buildUrl(op: Operation, args: Dict): URL {
  const base = Deno.env.get("DAFTRA_BASE_URL") || `https://${Deno.env.get("DAFTRA_SUBDOMAIN") || ""}.daftra.com`;
  const host = new URL(base).hostname;
  if (!/^[a-z0-9-]+\.daftra\.com$/i.test(host)) throw new Error("DAFTRA_BASE_URL must be a tenant on daftra.com");
  const pathArgs = isObject(args.path_params) ? args.path_params : {};
  let path = op.p.replaceAll("{format}", ".json");
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const v = pathArgs[match[1]] ?? pathArgs[match[1].toLowerCase()];
    if ((typeof v !== "string" && typeof v !== "number") || v === "")
      throw new Error(`Missing or invalid path parameter: ${match[1]}`);
    path = path.replace(match[0], encodeURIComponent(String(v)));
  }
  if (!path.startsWith("/") || path.includes("..") || path.includes("{")) throw new Error("Invalid operation path");
  const url = new URL(path.startsWith("/v2/") ? path : `/api2${path}`, `https://${host}`);
  const query = isObject(args.query) ? { ...args.query } : {};

  // حماية التصفح (Pagination Guard) لعمليات الـ GET القوائم
  if (op.m.toUpperCase() === "GET" && !url.pathname.match(/\/\d+\.json$/)) {
    if (!query.limit && !query.per_page) {
      query.limit = 20; // حد افتراضي ذكي
    } else if (Number(query.limit) > 50) {
      query.limit = 50; // حد أقصى لحماية السياق
    }
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((x) => url.searchParams.append(key + "[]", String(x)));
    else if (["string", "number", "boolean"].includes(typeof value)) url.searchParams.set(key, String(value));
    else throw new Error(`Invalid query parameter: ${key}`);
  }
  return url;
}

export async function callDaftra(op: Operation, args: Dict): Promise<ToolResult> {
  const url = buildUrl(op, args);
  const mode = (Deno.env.get("DAFTRA_AUTH_MODE") || "apikey").toLowerCase();
  const key = mode === "bearer" ? Deno.env.get("DAFTRA_ACCESS_TOKEN") : Deno.env.get("DAFTRA_API_KEY");
  if (!key) return toolResult(`Missing Daftra credential for ${mode}`, true);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (mode === "bearer") headers.Authorization = `Bearer ${key}`;
  else headers.APIKEY = key;

  const timeout = Math.min(120000, Math.max(1000, Number(Deno.env.get("DAFTRA_TIMEOUT") || 60) * 1000));
  const method = op.m.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return toolResult("Unsupported HTTP method", true);

  const isWrite = method !== "GET" || /update_|convert_to_|activate|\/lock|\/unlock|\/delete\//i.test(op.p);
  if (isWrite && Deno.env.get("ENABLE_WRITE_TOOLS") !== "true")
    return toolResult("Write tools disabled by ENABLE_WRITE_TOOLS", true);
  if (isWrite && Deno.env.get("DRY_RUN") === "true")
    return toolResult({ dry_run: true, method, url: url.toString(), body: args.body }, false);

  try {
    let payload: string | undefined;
    if (method !== "GET" && args.body !== undefined) {
      if (op.p === "/v2/oauth/token") {
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(args.body as Dict)) form.set(k, String(v));
        payload = form.toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      } else {
        payload = JSON.stringify(args.body);
        headers["Content-Type"] = "application/json";
      }
    }

    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });

    const raw = await res.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* text response */
    }

    // تطبيق تقليص استهلاك السياق (Compact / Fields Filter)
    const view = typeof args.view === "string" ? args.view : "compact";
    const fields = Array.isArray(args.fields) ? (args.fields as string[]) : undefined;

    const processedData = view === "full" ? data : makeCompact(data, fields);

    const output = JSON.stringify({ status: res.status, data: processedData });
    return toolResult(
      output.length > 80000
        ? { status: res.status, truncated: true, preview: output.slice(0, 80000) }
        : { status: res.status, data: processedData },
      !res.ok
    );
  } catch (e) {
    return toolResult({ error: e instanceof Error ? e.message : String(e) }, true);
  }
}
