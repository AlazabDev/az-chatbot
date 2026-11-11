import type { Operation, Dict, ToolResult } from "./types.ts";
import { isObject, toolResult } from "./types.ts";

function pruneNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneNulls).filter((v) => v !== null && v !== undefined);
  if (isObject(value)) {
    const cleaned: Dict = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined || v === "") continue;
      cleaned[k] = pruneNulls(v);
    }
    return cleaned;
  }
  return value;
}

function pickFields(item: unknown, fields: string[]): unknown {
  if (!isObject(item)) return item;
  const picked: Dict = {};
  for (const field of fields) if (field in item) picked[field] = item[field];
  return picked;
}

function makeCompact(data: unknown, fields?: string[]): unknown {
  const pruned = pruneNulls(data);
  if (fields && fields.length > 0) {
    if (Array.isArray(pruned)) return pruned.map((item) => pickFields(item, fields));
    if (isObject(pruned) && Array.isArray((pruned as Dict).data)) {
      return { ...(pruned as Dict), data: ((pruned as Dict).data as unknown[]).map((item) => pickFields(item, fields)) };
    }
    return pickFields(pruned, fields);
  }
  return pruned;
}

function buildUrl(op: Operation, args: Dict): URL {
  const base = Deno.env.get("MAGICPLAN_BASE_URL") || "https://cloud.magicplan.app/api/v2";
  const url = new URL(base.endsWith("/") ? base.slice(0, -1) : base);
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(new URL(base).host) || new URL(base).host !== url.host)
    throw new Error("Invalid MAGICPLAN_BASE_URL host");
  const pathArgs = isObject(args.path_params) ? args.path_params : {};
  let path = op.p;
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const v = pathArgs[match[1]] ?? pathArgs[match[1].toLowerCase()];
    if ((typeof v !== "string" && typeof v !== "number") || v === "")
      throw new Error(`Missing or invalid path parameter: ${match[1]}`);
    path = path.replace(match[0], encodeURIComponent(String(v)));
  }
  if (!path.startsWith("/") || path.includes("..") || path.includes("{")) throw new Error("Invalid operation path");
  url.pathname = (url.pathname.replace(/\/$/, "")) + path;
  const query = isObject(args.query) ? { ...args.query } : {};
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((x) => url.searchParams.append(key + "[]", String(x)));
    else if (["string", "number", "boolean"].includes(typeof value)) url.searchParams.set(key, String(value));
    else throw new Error(`Invalid query parameter: ${key}`);
  }
  return url;
}

export async function callMagicplan(op: Operation, args: Dict): Promise<ToolResult> {
  const url = buildUrl(op, args);
  const key = Deno.env.get("MAGICPLAN_API_KEY");
  const customer = Deno.env.get("MAGICPLAN_CUSTOMER_ID");
  if (!key || !customer) return toolResult("Missing MAGICPLAN_API_KEY or MAGICPLAN_CUSTOMER_ID", true);

  const headers: Record<string, string> = { Accept: "application/json", key, customer };
  const method = op.m.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return toolResult("Unsupported HTTP method", true);

  if (Deno.env.get("DRY_RUN") === "true" && method !== "GET")
    return toolResult({ dry_run: true, method, url: url.toString(), body: args.body }, false);

  const timeout = Math.min(120000, Math.max(1000, Number(Deno.env.get("MAGICPLAN_TIMEOUT") || 60) * 1000));
  try {
    let payload: string | undefined;
    if (method !== "GET" && args.body !== undefined) {
      payload = JSON.stringify(args.body);
      headers["Content-Type"] = "application/json";
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
