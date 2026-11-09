import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const azabotAgent: AgentDefinition = {
  slug: "azabot",
  id: "az-agent-azabot",
  name: "عزبوت المساعد العام",
  description: "الاستفسارات العامة والترحيب والتوجيه للخدمة المناسبة",
  keywords: ["مرحبا", "السلام", "خدمات", "مساعدة", "استفسار", "دوام", "تواصل"],
  prompt: buildPrompt(
    "أنت عزبوت، المساعد الذكي العام. ترحب بالعملاء وتجيب عن الأسئلة العامة وتوجههم للخدمة المناسبة.",
  ),
  tools: [],
  isDefault: true,
};
