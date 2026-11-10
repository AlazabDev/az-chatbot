// modules/clients.ts
import { callDaftraApi } from "../daftra-client.ts";

export const clientTools = [
  {
    name: "daftra_list_clients",
    description: "البحث عن العملاء في دفترة بالاسم أو الهاتف أو البريد الإلكتروني أو عرض قائمة العملاء.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "عدد العملاء لكل صفحة" },
        search: { type: "string", description: "كلمة البحث (اسم العميل، الهاتف، البريد، الرقم الضريبي)" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "client", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[search]": args.search
      });
    }
  },
  {
    name: "daftra_get_client",
    description: "جلب الملف الكامل لعميل بواسطة معرف العميل (Client ID) شامل أرصدته وبيانات الاتصال.",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "معرف العميل" }
      },
      required: ["client_id"]
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", `client/${args.client_id}`);
    }
  },
  {
    name: "daftra_create_client",
    description: "إضافة عميل جديد في دفترة (يتطلب confirm=true للتنفيذ).",
    inputSchema: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "الاسم الأول / اسم الشركة أو النشاط" },
        last_name: { type: "string", description: "الاسم الأخير" },
        email: { type: "string", description: "البريد الإلكتروني للعميل" },
        phone1: { type: "string", description: "رقم الهاتف / الواتساب" },
        address1: { type: "string", description: "العنوان" },
        tax_number: { type: "string", description: "الرقم الضريبي للعميل" },
        confirm: { type: "boolean", description: "تأكيد إضافة العميل" }
      },
      required: ["first_name", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إضافة عميل تتطلب موافقة صريحة عبر تمرير confirm=true.");
      }
      const payload = {
        Client: {
          first_name: args.first_name,
          last_name: args.last_name || "",
          email: args.email,
          phone1: args.phone1,
          address1: args.address1,
          tax_number: args.tax_number
        }
      };
      return await callDaftraApi("POST", "client", payload);
    }
  }
];
