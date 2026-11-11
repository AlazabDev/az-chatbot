import catalog from "../catalog.json" with {type:"json"};
import {validateRegistry} from "../modules/registry.ts";
import type {Operation} from "../types.ts";
const c=validateRegistry(catalog as Operation[]);
if(c.operations!==301||c.modules!==70)throw Error("Coverage mismatch: "+JSON.stringify(c));
console.log("PASS",c);
