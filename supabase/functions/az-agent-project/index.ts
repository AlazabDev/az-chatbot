import { AGENT_CONFIGS } from "../az-model-core/prompt.ts";
import { handleAgentRequest } from "../az-model-core/index.ts";

Deno.serve((req) => handleAgentRequest(req, AGENT_CONFIGS.project));
