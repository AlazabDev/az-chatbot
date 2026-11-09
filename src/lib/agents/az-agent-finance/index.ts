import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const financeAgent: AgentDefinition = {
  slug: "finance",
  id: "az-agent-finance",
  name: "وكيل المالية",
  description: "الفواتير وعروض الأسعار والمستحقات",
  keywords: ["فاتورة", "فواتير", "عرض سعر", "تسعير", "مستحقات", "ضريبة", "حساب مالي", "كشف حساب"],
  prompt: buildPrompt(
    "أنت وكيل المالية. تجيب عن الفواتير وعروض الأسعار والمستحقات بشكل عام دون كشف بيانات مالية لغير صاحبها.",
  ),
  tools: [],
};
