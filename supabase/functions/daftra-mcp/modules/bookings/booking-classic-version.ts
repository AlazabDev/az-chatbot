import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "post_bookings_add",
  "delete_bookings_bookingId",
  "get_bookings_change_status_bookingId_bookingStatus",
  "get_bookings_convert_to_invoice_bookingId"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
