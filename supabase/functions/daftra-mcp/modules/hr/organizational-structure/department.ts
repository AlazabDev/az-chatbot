import { callDaftra } from "../../../daftra-client.ts";
import type { Operation, Dict } from "../../../types.ts";
export const operationIds = [
  "get_department_list_1",
  "get_department_id_1",
  "post_department",
  "put_department_id"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
