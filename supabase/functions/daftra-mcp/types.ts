export type Dict = Record<string, unknown>;
export interface Operation { id:string; m:string; p:string; s:string; t:string; module:string; params:Array<{n:string; in:string; r:boolean; d:string; schema?:unknown}>; body?:unknown }
export type ToolResult = { content: Array<{type:"text";text:string}>; isError:boolean };
export const toolResult = (value:unknown,isError=false): ToolResult => ({content:[{type:"text",text:typeof value==="string"?value:JSON.stringify(value)}],isError});
export const isObject = (v:unknown):v is Dict => v !== null && typeof v === "object" && !Array.isArray(v);
