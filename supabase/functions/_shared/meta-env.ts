// _shared/meta-env.ts — Production-Ready
// متغيرات البيئة المشتركة بين جميع Edge Functions

export function getMetaAccessToken(): string {
  return Deno.env.get("WA_ACCESS_TOKEN") || Deno.env.get("META_TOKEN") || "";
}

export function requireMetaAccessToken(): string {
  const v = getMetaAccessToken();
  if (!v) throw new Error("Meta access token missing (set WA_ACCESS_TOKEN or META_TOKEN)");
  return v;
}

export function getMetaBusinessId(): string {
  return Deno.env.get("WA_BUSINESS_ID") || Deno.env.get("META_BUSINESS_ID") || "";
}

export function requireMetaBusinessId(): string {
  const v = getMetaBusinessId();
  if (!v) throw new Error("Meta business id missing (set WA_BUSINESS_ID or META_BUSINESS_ID)");
  return v;
}

export function getMetaApiVersion(): string {
  return Deno.env.get("WA_API_VERSION") || Deno.env.get("META_API_VERSION") || "v21.0";
}

export function getWebhookVerifyToken(): string {
  return Deno.env.get("WA_WEBHOOK_VERIFY_TOKEN") || Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
}

export function getMetaAppSecret(): string {
  return Deno.env.get("WA_APP_SECRET") || Deno.env.get("META_APP_SECRET") || "";
}

/**
 * تحقق من وجود جميع المتغيرات الأساسية
 * استخدمها في بداية أي Edge Function حساسة
 */
export function validateRequiredEnv(vars: string[]): void {
  const missing = vars.filter((v) => !Deno.env.get(v));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

/**
 * تنسيق رقم الهاتف بصيغة E.164
 */
export function normalizePhoneE164(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.trim().replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}
