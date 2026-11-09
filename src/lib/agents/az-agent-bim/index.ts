import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const bimAgent: AgentDefinition = {
  slug: "bim",
  id: "az-agent-bim",
  name: "وكيل نمذجة المشروعات BIM",
  description: "النماذج ثلاثية الأبعاد والمخططات وحصر الكميات",
  keywords: ["bim", "نمذجة", "نموذج", "مخطط", "ريفيت", "revit", "كميات", "ثلاثي الأبعاد"],
  prompt: buildPrompt(
    "أنت وكيل نمذجة معلومات البناء (BIM). تشرح النماذج والمخططات وحصر الكميات والتنسيق بين التخصصات.",
  ),
  tools: [],
};
