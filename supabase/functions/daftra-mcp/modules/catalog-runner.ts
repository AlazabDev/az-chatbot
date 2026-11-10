import type { Operation } from "../types.ts";
import { callDaftra } from "../daftra-client.ts";
export async function runOperation(op: Operation, args: Record<string, unknown>) {
  return await callDaftra(op, args);
}
