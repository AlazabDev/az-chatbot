// Microsoft Foundry finance extraction.
// Production policy: financial OCR is processed only by the configured Microsoft Foundry project.

const PROJECT_ENDPOINT = (Deno.env.get("FOUNDRY_PROJECT_ENDPOINT") ?? "").replace(/\/+$/, "");
const AGENT_ID = Deno.env.get("FOUNDRY_AGENT_ID") ?? "";
const API_VERSION = Deno.env.get("FOUNDRY_API_VERSION") ?? "v1";
const API_KEY = Deno.env.get("FOUNDRY_API_KEY") ?? "";
const AZURE_TENANT_ID = Deno.env.get("AZURE_TENANT_ID") ?? "";
const AZURE_CLIENT_ID = Deno.env.get("FOUNDRY_CLIENT_ID") ?? Deno.env.get("AZURE_CLIENT_ID") ?? "";
const AZURE_CLIENT_SECRET =
  Deno.env.get("FOUNDRY_CLIENT_SECRET") ?? Deno.env.get("AZURE_CLIENT_SECRET") ?? "";

let cachedToken: { value: string; expiresAt: number } | null = null;

function entraConfigured() {
  return Boolean(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);
}

export function foundryConfigured() {
  return Boolean(PROJECT_ENDPOINT && AGENT_ID && (entraConfigured() || API_KEY));
}

export interface FinanceExtraction {
  doc_type: string | null;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  payment_method: string | null;
  reference_number: string | null;
  bank: string | null;
  person: string | null;
  description: string | null;
  financial_category: string | null;
  project_or_cost_center: string | null;
  summary: string | null;
  line_items: { description: string; qty?: number; amount?: number }[];
  confidence: number | null;
  provider: string;
}

const SYSTEM_PROMPT = `أنت وكيل مالي لشركة مقاولات وصيانة. تستلم OCR من مستند مالي. أعد JSON فقط بدون شرح بهذا الشكل:
{"doc_type":"invoice|receipt|purchase_order|statement|bank_transfer|quote|other","vendor":null,"invoice_number":null,"invoice_date":null,"currency":null,"total_amount":null,"tax_amount":null,"payment_method":null,"reference_number":null,"bank":null,"person":null,"description":null,"financial_category":null,"project_or_cost_center":null,"summary":null,"line_items":[],"confidence":null}
استخدم null لكل قيمة غير موجودة صراحة. لا تخترع بيانات أو مشروع أو تصنيف بدون دليل.`;

function parseJson(text: string): Partial<FinanceExtraction> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

function normalize(raw: Partial<FinanceExtraction>, provider: string): FinanceExtraction {
  const num = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const number =
      typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const date =
    typeof raw.invoice_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.invoice_date)
      ? raw.invoice_date
      : null;

  return {
    doc_type: str(raw.doc_type),
    vendor: str(raw.vendor),
    invoice_number: str(raw.invoice_number),
    invoice_date: date,
    currency: str(raw.currency)?.toUpperCase() ?? null,
    total_amount: num(raw.total_amount),
    tax_amount: num(raw.tax_amount),
    payment_method: str(raw.payment_method),
    reference_number: str(raw.reference_number),
    bank: str(raw.bank),
    person: str(raw.person),
    description: str(raw.description),
    financial_category: str(raw.financial_category),
    project_or_cost_center: str(raw.project_or_cost_center),
    summary: str(raw.summary),
    line_items: Array.isArray(raw.line_items) ? raw.line_items.slice(0, 100) : [],
    confidence: num(raw.confidence),
    provider,
  };
}

async function getEntraToken() {
  if (!entraConfigured()) throw new Error("Foundry Entra credentials not configured");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const form = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://ai.azure.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`Entra token request failed with status ${response.status}`);
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function foundryHeaders(): Promise<Record<string, string>> {
  if (entraConfigured()) {
    return {
      Authorization: `Bearer ${await getEntraToken()}`,
      "Content-Type": "application/json",
    };
  }
  if (API_KEY) return { "api-key": API_KEY, "Content-Type": "application/json" };
  throw new Error("Foundry authentication is not configured");
}

async function runFoundryAgent(prompt: string): Promise<FinanceExtraction> {
  if (!foundryConfigured()) throw new Error("Foundry finance agent is not configured");

  const headers = await foundryHeaders();
  const qs = `?api-version=${API_VERSION}`;
  const threadResponse = await fetch(`${PROJECT_ENDPOINT}/threads${qs}`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!threadResponse.ok) {
    throw new Error(`Foundry thread request failed with status ${threadResponse.status}`);
  }
  const threadId = (await threadResponse.json()).id;

  const messageResponse = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ role: "user", content: `${SYSTEM_PROMPT}\n\n---\n${prompt}` }),
  });
  if (!messageResponse.ok) {
    throw new Error(`Foundry message request failed with status ${messageResponse.status}`);
  }

  const runResponse = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ assistant_id: AGENT_ID }),
  });
  if (!runResponse.ok) {
    throw new Error(`Foundry run request failed with status ${runResponse.status}`);
  }

  let run = await runResponse.json();
  for (
    let index = 0;
    index < 40 && ["queued", "in_progress", "requires_action"].includes(run.status);
    index++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await fetch(`${PROJECT_ENDPOINT}/threads/${threadId}/runs/${run.id}${qs}`, {
      headers,
    });
    if (!poll.ok) throw new Error(`Foundry poll failed with status ${poll.status}`);
    run = await poll.json();
  }

  if (run.status !== "completed") throw new Error(`Foundry run status: ${run.status}`);

  const listResponse = await fetch(
    `${PROJECT_ENDPOINT}/threads/${threadId}/messages${qs}&order=desc&limit=5`,
    { headers },
  );
  if (!listResponse.ok) {
    throw new Error(`Foundry messages request failed with status ${listResponse.status}`);
  }

  const list = await listResponse.json();
  const assistantMessage = (list.data ?? []).find((message: any) => message.role === "assistant");
  const text = (assistantMessage?.content ?? [])
    .map((content: any) => content?.text?.value ?? content?.text ?? "")
    .join("\n");

  return normalize(parseJson(text), "foundry");
}

export async function extractFinanceData(
  ocrText: string,
  hints: string[] = [],
): Promise<FinanceExtraction> {
  const prompt = `نص المستند:\n${ocrText.slice(0, 12000)}\n\nوسوم الصورة: ${hints.join(", ") || "-"}`;
  return runFoundryAgent(prompt);
}
