import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_refund_receipts_format",
  "post_refund_receipts_format",
  "get_refund_receipts_id_format",
  "put_refund_receipts_id_format",
  "delete_refund_receipts_id_format",
  "post_invoices_add_bulk_refund_receipts_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
