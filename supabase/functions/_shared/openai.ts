export function getOpenAIApiKey(): string {
  return Deno.env.get("OPENAI_API_KEY") || "";
}

export function requireOpenAIApiKey(): string {
  const value = getOpenAIApiKey();
  if (!value) throw new Error("OPENAI_API_KEY is not configured");
  return value;
}

export function getOpenAIBaseUrl(): string {
  return (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
}

export function getOpenAITextModel(): string {
  return (
    Deno.env.get("OPENAI_MODEL_TEXT") ||
    Deno.env.get("OPENAI_MODEL") ||
    Deno.env.get("CHATBOT_AI_MODEL") ||
    "gpt-5-mini"
  );
}

export function getOpenAIVisionModel(): string {
  return (
    Deno.env.get("OPENAI_MODEL_VISION") ||
    Deno.env.get("OPENAI_MODEL") ||
    Deno.env.get("AI_VISION_MODEL") ||
    "gpt-5.4"
  );
}

export function getOpenAIMaxOutputTokens(defaultValue: number): number {
  const raw =
    Deno.env.get("OPENAI_MAX_OUTPUT_TOKENS") ||
    Deno.env.get("CHATBOT_MAX_TOKENS") ||
    `${defaultValue}`;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function buildOpenAIHeaders(apiKey: string, clientRequestId?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (clientRequestId) {
    headers["X-Client-Request-Id"] = clientRequestId;
  }

  return headers;
}

export function extractOpenAIText(responseJson: any): string {
  if (typeof responseJson?.output_text === "string" && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }

  const output = Array.isArray(responseJson?.output) ? responseJson.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export function extractFirstJsonObject(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  return null;
}
