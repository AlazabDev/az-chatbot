import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_invoices_format",
  "post_invoices_format",
  "get_invoices_id_format",
  "put_invoices_id_format",
  "delete_invoices_id_format",
  "bulkAddInvoices",
  "get_invoices_update_draft_id_draft_status_format",
  "post_invoices_assign_work_order_id_format",
  "post_invoices_add_shipping_id_format",
  "post_sales_orders_convert_to_invoice_id_format",
  "delete_sales_orders_id_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
