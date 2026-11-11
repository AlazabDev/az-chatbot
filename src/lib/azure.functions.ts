import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) {
    throw new Error("Forbidden: admin role required.");
  }
}

interface AzureMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AzureRequestData {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  temperature: number;
  maxTokens: number;
  messages: AzureMessage[];
}

const ALLOWED_ENDPOINT_HOST_SUFFIXES = [".openai.azure.com", ".cognitiveservices.azure.com"];

function assertAllowedEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Endpoint غير صالح.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Endpoint يجب أن يستخدم HTTPS.");
  }
  const host = url.hostname.toLowerCase();
  const ok = ALLOWED_ENDPOINT_HOST_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok) {
    throw new Error("Endpoint غير مسموح: يجب أن يكون مورد Azure OpenAI رسمي.");
  }
  return url;
}

export const callAzureOpenAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AzureRequestData) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { endpoint, apiKey, deployment, apiVersion, temperature, maxTokens } = data;
    // Never trust client-supplied roles: only plain user turns are forwarded.
    const messages = (Array.isArray(data.messages) ? data.messages : [])
      .slice(-20)
      .filter((m) => m && typeof m.content === "string")
      .map((m) => ({ role: "user" as const, content: String(m.content).slice(0, 8000) }));

    if (!endpoint || !apiKey || !deployment) {
      throw new Error("الإعدادات غير مكتملة: endpoint و apiKey و deployment مطلوبة.");
    }
    const base = assertAllowedEndpoint(endpoint).toString().replace(/\/+$/, "");

    const url = `${base}/openai/deployments/${encodeURIComponent(
      deployment,
    )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure OpenAI ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const reply = json.choices?.[0]?.message?.content ?? "";
    return { reply, usage: json.usage };
  });

export const testAzureConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Omit<AzureRequestData, "messages" | "temperature" | "maxTokens">) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const base = assertAllowedEndpoint(data.endpoint).toString().replace(/\/+$/, "");
    const url = `${base}/openai/deployments/${encodeURIComponent(
      data.deployment,
    )}/chat/completions?api-version=${encodeURIComponent(data.apiVersion)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": data.apiKey,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    return { ok: res.ok, status: res.status, statusText: res.statusText };
  });
