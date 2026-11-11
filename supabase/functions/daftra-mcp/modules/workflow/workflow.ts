import { callDaftra } from "../../daftra-client.ts";
import type { Operation, Dict } from "../../types.ts";
export const operationIds = [
  "get_le_workflow_type_entity_workflow_id_list_format",
  "get_le_workflow_type_entity_workflow_id_record_id_format",
  "post_le_workflow_type_entity_workflow_id",
  "put_le_workflow_type_entity_workflow_id_record_id"
] as const;
const supported = new Set<string>(operationIds);
export function supports(id:string):boolean {return supported.has(id)}
export async function execute(operation:Operation, args:Dict) {
 if (!supports(operation.id)) throw new Error("Operation not registered in this module: " + operation.id);
 return await callDaftra(operation,args);
}
