// modules/inventory.ts
import { callDaftraApi } from "../daftra-client.ts";
import { McpTool } from "../types.ts";

export const inventoryTools: McpTool[] = [
  {
    name: "daftra_list_products",
    description: "استعراض والبحث في قائمة المنتجات والخدمات والمخزون الحالي والأسعار في دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "عدد النتائج" },
        search: { type: "string", description: "بحث بالاسم، الكود SKU، أو الباركود" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "products.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[search]": args.search
      });
    }
  },
  {
    name: "daftra_create_product",
    description: "إضافة منتج أو خدمة جديدة في دفترة وتحديد سعر البيع والشراء وتتبع المخزون (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم المنتج أو الخدمة" },
        unit_price: { type: "number", description: "سعر البيع" },
        buy_price: { type: "number", description: "سعر الشراء / التكلفة" },
        product_code: { type: "string", description: "كود المنتج SKU أو الباركود" },
        description: { type: "string", description: "وصف المنتج" },
        track_stock: { type: "number", description: "1 لتتبع كميات المخزون، 0 للخدمات غير المخزنية" },
        confirm: { type: "boolean", description: "تأكيد إضافة المنتج" }
      },
      required: ["name", "unit_price", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) throw new Error("إضافة منتج تتطلب تأكيداً بتمرير confirm=true.");
      return await callDaftraApi("POST", "products.json", {
        Product: {
          name: args.name,
          unit_price: args.unit_price,
          buy_price: args.buy_price || 0,
          product_code: args.product_code,
          description: args.description,
          track_stock: args.track_stock !== undefined ? args.track_stock : 1
        }
      });
    }
  },
  {
    name: "daftra_list_stock_transactions",
    description: "استعراض حركات وأذون المخزن (إضافة، صرف، تحويل بين المخازن، أو تسوية).",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        product_id: { type: "number", description: "فلترة حسب معرّف منتج محدد" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "stock_transactions.json", undefined, {
        page: args.page || 1,
        "filter[product_id]": args.product_id
      });
    }
  }
];
