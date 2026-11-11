import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_product_categories_format",
  "post_product_categories_format",
  "get_product_categories_id_format",
  "put_product_categories_id_format",
  "delete_product_categories_type_id_format",
  "post_categories_update_display_order_type_format",
  "post_categories_update_category_items_type_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
