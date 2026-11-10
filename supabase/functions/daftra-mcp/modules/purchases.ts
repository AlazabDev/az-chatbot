// modules/purchases.ts
import { callDaftraApi } from "../daftra-client.ts";
import { McpTool } from "../types.ts";

export const purchaseTools: McpTool[] = [
  {
    name: "daftra_list_suppliers",
    description: "استعراض والبحث في قائمة الموردين المسجلين في دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "الحد الأقصى" },
        search: { type: "string", description: "بحث باسم المورد أو الهاتف أو الرقم الضريبي" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "suppliers.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[search]": args.search
      });
    }
  },
  {
    name: "daftra_create_supplier",
    description: "إضافة مورد جديد في دفترة (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        business_name: { type: "string", description: "اسم شركة المورد أو الاسم التجاري" },
        first_name: { type: "string", description: "اسم جهة الاتصال الأولى" },
        phone1: { type: "string", description: "رقم الهاتف" },
        email: { type: "string", description: "البريد الإلكتروني" },
        tax_number: { type: "string", description: "الرقم الضريبي للمورد" },
        confirm: { type: "boolean", description: "تأكيد إضافة المورد" }
      },
      required: ["business_name", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) throw new Error("إضافة مورد تتطلب تأكيداً بتمرير confirm=true.");
      return await callDaftraApi("POST", "suppliers.json", {
        Supplier: {
          business_name: args.business_name,
          first_name: args.first_name || "",
          phone1: args.phone1,
          email: args.email,
          tax_number: args.tax_number
        }
      });
    }
  },
  {
    name: "daftra_list_purchase_invoices",
    description: "استعراض فواتير المشتريات من الموردين وحالة سدادها وتواريخها.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "عدد الفواتير" },
        supplier_id: { type: "number", description: "فلترة حسب معرّف المورد" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "purchase_invoices.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[supplier_id]": args.supplier_id
      });
    }
  },
  {
    name: "daftra_create_purchase_invoice",
    description: "إصدار فاتورة مشتريات جديدة وإدخال البضاعة في المستودع المحدد (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        supplier_id: { type: "number", description: "معرّف المورد" },
        date: { type: "string", description: "تاريخ الفاتورة YYYY-MM-DD" },
        store_id: { type: "number", description: "المستودع المستقبل للبضاعة" },
        items: {
          type: "array",
          description: "بنود المشتريات",
          items: {
            type: "object",
            properties: {
              product_id: { type: "number", description: "معرّف المنتج" },
              item: { type: "string", description: "اسم البند" },
              unit_price: { type: "number", description: "سعر الشراء" },
              quantity: { type: "number", description: "الكمية المشتراة" }
            },
            required: ["item", "unit_price", "quantity"]
          }
        },
        confirm: { type: "boolean", description: "تأكيد تسجيل فاتورة الشراء" }
      },
      required: ["supplier_id", "items", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) throw new Error("تسجيل فاتورة شراء يتطلب تأكيداً بتمرير confirm=true.");
      return await callDaftraApi("POST", "purchase_invoices.json", {
        PurchaseInvoice: {
          supplier_id: args.supplier_id,
          date: args.date || new Date().toISOString().split("T")[0],
          store_id: args.store_id
        },
        PurchaseInvoiceItem: args.items
      });
    }
  }
];
