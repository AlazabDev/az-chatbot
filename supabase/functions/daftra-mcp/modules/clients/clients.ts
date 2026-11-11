import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_clients_format",
  "post_clients_format",
  "get_clients_id_format",
  "put_clients_id_format",
  "delete_clients_id_format",
  "post_clients_assign_staff_id_format",
  "get_clients_loyalty_points_id_format",
  "post_clients_add_bulk_format",
  "get_clients_client_has_membership_format",
  "get_clients_client_attendance_barcode_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
