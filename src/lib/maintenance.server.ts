/**
 * Server-only bridge to the maintenance gateway (create / query / note / cancel).
 * The gateway API key never leaves the server.
 */

const SERVICE_TYPES = [
  "electrical",
  "plumbing",
  "hvac",
  "structural",
  "painting",
  "carpentry",
  "cleaning",
  "other",
] as const;

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function gatewayConfig() {
  const url = process.env["MAINTENANCE_GATEWAY_URL"];
  const key = process.env["MAINTENANCE_GATEWAY_API_KEY"];
  if (!url || !key) throw new Error("MAINTENANCE_GATEWAY not configured");
  return { url, key };
}

async function callGateway(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { url, key } = gatewayConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ channel: "api", ...payload }),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  const body =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  if (!res.ok || body["success"] === false || body["error"]) {
    console.error(`[Maintenance] ${res.status}: ${text.slice(0, 500)}`);
    return {
      ok: false,
      status: res.status,
      error: gatewayErrorMessage(res.status, body),
    };
  }
  return {
    ok: true,
    request_id: str(body["request_id"], 100) || undefined,
    request_number: str(body["request_number"], 100) || undefined,
    status: str(body["status"], 100) || undefined,
    workflow_stage:
      str(body["workflow_stage_v2"], 100) || str(body["workflow_stage"], 100) || undefined,
    track_url: safeTrackingUrl(body["track_url"]),
    message: str(body["message_ar"], 500) || str(body["message"], 500) || undefined,
  };
}

function gatewayErrorMessage(status: number, body: Record<string, unknown>): string {
  const providerMessage = str(body["message_ar"], 500);
  if (providerMessage) return providerMessage;
  if (status === 403) return "لا تتوفر صلاحية على هذا الطلب.";
  if (status === 404) return "لم يتم العثور على الطلب. تأكد من رقم الطلب وحاول مرة أخرى.";
  return "تعذر تنفيذ العملية على نظام الصيانة حالياً.";
}

function safeTrackingUrl(value: unknown): string | undefined {
  const candidate = str(value, 500);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Tool definitions exposed to the Foundry agent (Responses API function tools). */
export const maintenanceTools = [
  {
    type: "function",
    name: "create_maintenance_request",
    description:
      "إنشاء طلب صيانة حقيقي للعميل. لا تستدعها حتى تجمع اسم العميل ورقم الجوال ونوع الخدمة ووصف المشكلة. بعد نجاحها يجب عرض request_number وtrack_url حرفياً للعميل.",
    parameters: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "اسم العميل" },
        client_phone: { type: "string", description: "رقم جوال العميل" },
        service_type: { type: "string", enum: [...SERVICE_TYPES] },
        description: { type: "string", description: "وصف المشكلة" },
        priority: { type: "string", enum: [...PRIORITIES] },
      },
      required: ["client_name", "client_phone", "service_type", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_maintenance_status",
    description:
      "الاستفسار الحقيقي عن حالة طلب صيانة قائم. اطلب request_number من العميل إن لم يرسله، ثم اعرض request_number وstatus وworkflow_stage وtrack_url من النتيجة حرفياً.",
    parameters: {
      type: "object",
      properties: {
        request_number: { type: "string" },
        request_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "add_maintenance_note",
    description: "إضافة ملاحظة من العميل على طلب صيانة قائم.",
    parameters: {
      type: "object",
      properties: {
        request_number: { type: "string" },
        request_id: { type: "string" },
        note: { type: "string" },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cancel_maintenance_request",
    description: "إلغاء طلب صيانة قائم بناءً على طلب العميل.",
    parameters: {
      type: "object",
      properties: {
        request_number: { type: "string" },
        request_id: { type: "string" },
        reason: { type: "string" },
      },
      additionalProperties: false,
    },
  },
] as const;

export const MAINTENANCE_TOOL_NAMES = maintenanceTools.map((t) => t.name);

function refFields(args: Record<string, unknown>) {
  const id = str(args["request_id"], 80);
  const num = str(args["request_number"], 80);
  const out: Record<string, unknown> = {};
  if (id) out["request_id"] = id;
  else if (num) out["request_number"] = num;
  return out;
}

/** Execute one tool call requested by the agent. Never throws. */
export async function runMaintenanceTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case "create_maintenance_request": {
        const client_name = str(args["client_name"], 120);
        const client_phone = str(args["client_phone"], 30);
        const service_type = str(args["service_type"], 40) || "other";
        const description = str(args["description"], 2000);
        if (!client_name || !client_phone || !description) {
          return { ok: false, error: "بيانات ناقصة: الاسم والجوال والوصف مطلوبة." };
        }
        const priority = str(args["priority"], 20);
        return await callGateway({
          client_name,
          client_phone,
          service_type: (SERVICE_TYPES as readonly string[]).includes(service_type)
            ? service_type
            : "other",
          description,
          priority: (PRIORITIES as readonly string[]).includes(priority) ? priority : "medium",
        });
      }
      case "get_maintenance_status": {
        const ref = refFields(args);
        if (!Object.keys(ref).length) {
          return { ok: false, error: "أحتاج رقم الطلب للاستعلام." };
        }
        return await callGateway({ action: "get_status", client_name: "x", ...ref });
      }
      case "add_maintenance_note": {
        const ref = refFields(args);
        const note = str(args["note"], 1000);
        if (!Object.keys(ref).length || !note) {
          return { ok: false, error: "أحتاج رقم الطلب ونص الملاحظة." };
        }
        return await callGateway({
          action: "add_note",
          client_name: "x",
          note,
          ...ref,
        });
      }
      case "cancel_maintenance_request": {
        const ref = refFields(args);
        if (!Object.keys(ref).length) {
          return { ok: false, error: "أحتاج رقم الطلب للإلغاء." };
        }
        return await callGateway({
          action: "cancel",
          client_name: "x",
          reason: str(args["reason"], 300) || "طلب العميل الإلغاء",
          ...ref,
        });
      }
      default:
        return { ok: false, error: "أداة غير معروفة." };
    }
  } catch (err) {
    console.error("[Maintenance] tool error:", err);
    return { ok: false, error: "تعذر الاتصال بنظام الصيانة حالياً." };
  }
}

export function maintenanceToolsAvailable(): boolean {
  return Boolean(
    process.env["MAINTENANCE_GATEWAY_URL"] && process.env["MAINTENANCE_GATEWAY_API_KEY"],
  );
}

/** Extra guidance appended to the model instructions when tools are active. */
export const MAINTENANCE_GUIDANCE = `
أنت مساعد خدمة عملاء للصيانة. يمكنك تنفيذ العمليات التالية عبر الأدوات المتاحة:
- إنشاء طلب صيانة جديد: اجمع أولاً اسم العميل، رقم الجوال، نوع الخدمة (كهرباء، سباكة، تكييف، إنشائي، دهان، نجارة، نظافة، أخرى)، ووصف المشكلة. اسأل فقط عن البيانات الناقصة، ثم نفّذ create_maintenance_request فور اكتمالها.
- بعد نجاح الإنشاء: أكد التنفيذ واعرض request_number كرَقْم الطلب وtrack_url كرابط متابعة قابل للفتح. لا تقل إن الطلب أُنشئ ما لم تعد الأداة ok=true.
- الاستفسار عن حالة طلب: اطلب رقم الطلب إذا كان ناقصاً، ثم نفّذ get_maintenance_status واعرض رقم الطلب والحالة والمرحلة الحالية ورابط المتابعة.
- إضافة ملاحظة أو إلغاء طلب عند طلب العميل.
لا تخترع أرقام طلبات أو حالات أو روابط؛ انقلها فقط من نتيجة الأداة. إذا أعادت الأداة خطأ، اشرحه للعميل ولا تدّعي نجاح العملية. اردد بالعربية باختصار واحترافية.
`.trim();
