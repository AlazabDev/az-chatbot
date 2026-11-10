import { AGENT_CONFIGS } from "../az-model-core/prompt.ts";
import { handleAgentRequest } from "../az-model-core/index.ts";

const maintTools = [
  {
    type: "function",
    function: {
      name: "create_maintenance_request",
      description: "تسجيل طلب صيانة جديد في نظام UberFix",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "اسم العميل الكامل" },
          customer_phone: { type: "string", description: "رقم هاتف العميل" },
          branch: { type: "string", description: "اسم أو رمز الفرع أو الموقع" },
          request_type: {
            type: "string",
            enum: ["default", "urgent", "inspection", "periodic"],
            description: "نوع طلب الصيانة",
          },
          service_type: {
            type: "string",
            enum: ["hvac", "electricity", "plumbing", "carpentry", "painting", "facade", "kitchen_equipment", "other"],
            description: "تصنيف خدمة الصيانة",
          },
          description: { type: "string", description: "وصف تفصيلي للعطل أو الطلب" },
        },
        required: ["customer_name", "customer_phone", "branch", "request_type", "service_type", "description"],
      },
    },
  },
];

const config = { ...AGENT_CONFIGS.maint, tools: maintTools };
Deno.serve((req) => handleAgentRequest(req, config));
