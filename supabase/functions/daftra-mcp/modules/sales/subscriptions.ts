import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_invoices_subscription_format",
  "get_invoices_view_subscription_id_format",
  "post_invoices_add_subscription_format",
  "put_invoices_edit_subscription_id_format",
  "delete_invoices_delete_subscription_id_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
