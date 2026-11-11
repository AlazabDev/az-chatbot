import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "delete_journals_id_format",
  "put_journals_id_format",
  "get_journals_id_format",
  "get_journals_format",
  "post_journals_format"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
