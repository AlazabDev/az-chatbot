import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const paymentsAgent: AgentDefinition = {
  slug: "payments",
  id: "az-agent-payments",
  name: "وكيل المدفوعات",
  description: "طرق الدفع وحالة المدفوعات والإيصالات",
  keywords: ["دفع", "سداد", "مدفوعات", "إيصال", "ايصال", "تحويل بنكي", "بطاقة", "استرداد"],
  prompt: buildPrompt(
    "أنت وكيل المدفوعات. تشرح طرق الدفع المتاحة وخطوات السداد والاسترداد وتساعد في مشكلات الدفع.",
  ),
  tools: [],
};
