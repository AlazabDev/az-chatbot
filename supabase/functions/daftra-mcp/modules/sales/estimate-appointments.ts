import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_estimate_appointments_format",
  "post_estimate_appointments_format",
  "get_estimate_appointments_id_format",
  "put_estimate_appointments_id_format",
  "delete_estimate_appointments_id_format",
  "post_estimate_appointments_id_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
