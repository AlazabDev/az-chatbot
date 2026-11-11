// modules/products-finance.ts
import { callDaftraApi } from "../daftra-client.ts";

export const productsFinanceTools = [
  {
    name: "daftra_list_products",
    description: "استعراض قائمة المنتجات والخدمات والمخزون الحالي والأسعار من دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "الحد الأقصى للنتائج" },
        search: { type: "string", description: "بحث بالاسم أو الباركود أو كود المنتج SKU" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "product", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[search]": args.search
      });
    }
  },
  {
    name: "daftra_list_payments",
    description: "جلب قائمة المدفوعات وسندات القبض المسجلة في دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "number", description: "فلترة حسب رقم الفاتورة" },
        client_id: { type: "number", description: "فلترة حسب العميل" },
        page: { type: "number", description: "رقم الصفحة" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "payment", undefined, {
        "filter[invoice_id]": args.invoice_id,
        "filter[client_id]": args.client_id,
        page: args.page || 1
      });
    }
  },
  {
    name: "daftra_create_payment",
    description: "تسجيل دفعة جديدة (سند قبض) على فاتورة أو لحساب عميل (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "number", description: "معرف الفاتورة المسدد لها" },
        amount: { type: "number", description: "قيمة المبلغ المدفوع" },
        payment_method: { type: "string", description: "طريقة الدفع (cash, bank, card, check...)" },
        date: { type: "string", description: "تاريخ السداد YYYY-MM-DD" },
        notes: { type: "string", description: "ملاحظات الدفعة" },
        confirm: { type: "boolean", description: "تأكيد السداد" }
      },
      required: ["invoice_id", "amount", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("تسجيل دفعة محاسبية يتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        Payment: {
          invoice_id: args.invoice_id,
          amount: args.amount,
          payment_method: args.payment_method || "cash",
          date: args.date || new Date().toISOString().split("T")[0],
          notes: args.notes
        }
      };
      return await callDaftraApi("POST", "payment", payload);
    }
  }
];
