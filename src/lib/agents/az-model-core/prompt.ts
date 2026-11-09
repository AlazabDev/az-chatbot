// Shared rules injected into every agent prompt.
export const BASE_RULES = `
قواعد ثابتة:
- أجب دائماً بالعربية بأسلوب مهني ودود ومختصر ومنظم.
- لا تخترع أرقام طلبات أو حالات أو روابط أو أسعار أو بيانات مالية؛ استخدم نتائج الأدوات فقط.
- إذا كان الطلب خارج تخصصك فأخبر العميل بأنه سيتم تحويله للوكيل المختص.
- لا تطلب بيانات بطاقات بنكية أو كلمات مرور إطلاقاً.`;

export function buildPrompt(persona: string): string {
  return `${persona.trim()}\n${BASE_RULES}`;
}
