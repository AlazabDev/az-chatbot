// modules/invoices.ts
import { callDaftraApi } from "../daftra-client.ts";

export const invoiceTools = [
  {
    name: "daftra_list_invoices",
    description: "جلب قائمة فواتير المبيعات من دفترة مع دعم الفلترة برقم الصفحة أو العميل أو الحالة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة (الافتراضي: 1)" },
        limit: { type: "number", description: "عدد الفواتير في الصفحة (الافتراضي: 20)" },
        client_id: { type: "number", description: "فلترة حسب معرف العميل" },
        status: { type: "string", description: "حالة الفاتورة (draft, paid, unpaid, partially_paid)" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "invoice", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[client_id]": args.client_id,
        "filter[status]": args.status
      });
    }
  },
  {
    name: "daftra_get_invoice",
    description: "جلب تفاصيل فاتورة محددة بواسطة معرف الفاتورة (Invoice ID).",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "number", description: "معرف الفاتورة في دفترة" }
      },
      required: ["invoice_id"]
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", `invoice/${args.invoice_id}`);
    }
  },
  {
    name: "daftra_create_invoice",
    description: "إنشاء فاتورة جديدة في دفترة (يتطلب تأكيداً مسبقاً confirm=true لحماية السجلات المحاسبية).",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "number", description: "معرف العميل" },
        date: { type: "string", description: "تاريخ الفاتورة بصيغة YYYY-MM-DD" },
        currency_code: { type: "string", description: "رمز العملة مثل EGP أو SAR أو USD" },
        items: {
          type: "array",
          description: "بنود الفاتورة",
          items: {
            type: "object",
            properties: {
              item_id: { type: "number", description: "معرف المنتج/الخدمة (اختياري إذا كان هناك اسم ووصف)" },
              item: { type: "string", description: "اسم البند" },
              unit_price: { type: "number", description: "سعر الوحدة" },
              quantity: { type: "number", description: "الكمية" },
              tax1: { type: "number", description: "نسبة الضريبة (مثال: 14)" }
            },
            required: ["unit_price", "quantity"]
          }
        },
        notes: { type: "string", description: "ملاحظات الفاتورة" },
        confirm: { type: "boolean", description: "يجب تمرير true صراحة للتنفيذ ومنع التعديل غير المقصود" }
      },
      required: ["client_id", "items", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("عملية إنشاء فاتورة تتطلب موافقة وتمرير confirm=true صراحة.");
      }
      const payload = {
        Invoice: {
          client_id: args.client_id,
          date: args.date || new Date().toISOString().split("T")[0],
          currency_code: args.currency_code,
          notes: args.notes
        },
        InvoiceItem: args.items.map((it: any) => ({
          item_id: it.item_id,
          item: it.item,
          unit_price: it.unit_price,
          quantity: it.quantity,
          tax1: it.tax1 || 0
        }))
      };
      return await callDaftraApi("POST", "invoice", payload);
    }
  }
];
