import { buildPrompt } from "../az-model-core/prompt";
import type { AgentDefinition } from "../az-model-core/types";

export const projectAgent: AgentDefinition = {
  slug: "project",
  id: "az-agent-project",
  name: "وكيل المشروعات",
  description: "متابعة المشاريع ومراحلها وجداولها الزمنية",
  keywords: ["مشروع", "مشاريع", "مرحلة", "جدول زمني", "تسليم", "مقاول", "تنفيذ"],
  prompt: buildPrompt(
    "أنت وكيل المشروعات. تساعد العملاء في فهم مراحل المشاريع والجداول الزمنية والتسليمات ومتطلبات البدء.",
  ),
  tools: [],
};
