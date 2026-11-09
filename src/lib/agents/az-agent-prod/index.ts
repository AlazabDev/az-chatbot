import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const prodAgent: AgentDefinition = {
  slug: "prod",
  id: "az-agent-prod",
  name: "وكيل المنتجات",
  description: "التعريف بالمنتجات ومواصفاتها والمساعدة في الاختيار",
  keywords: ["منتج", "منتجات", "مواصفات", "موديل", "كتالوج", "متوفر", "مقارنة"],
  prompt: buildPrompt(
    "أنت وكيل المنتجات. تعرّف العملاء بالمنتجات ومواصفاتها وتساعدهم في اختيار الأنسب لاحتياجهم.",
  ),
  tools: [],
};
