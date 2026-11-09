// Central agent registry. To add an agent: create az-agent-<slug>/index.ts and list it here.
import { azabotAgent } from "./az-agent-azabot";
import { paymentsAgent } from "./az-agent-payments";
import { projectAgent } from "./az-agent-project";
import { bimAgent } from "./az-agent-bim";
import { maintAgent } from "./az-agent-maint";
import { prodAgent } from "./az-agent-prod";
import { financeAgent } from "./az-agent-finance";
import type { AgentDefinition } from "./az-model-core/types";

export const AGENTS: AgentDefinition[] = [
  azabotAgent,
  maintAgent,
  paymentsAgent,
  financeAgent,
  projectAgent,
  bimAgent,
  prodAgent,
];

export const DEFAULT_AGENT = azabotAgent;

export function findAgent(idOrSlug?: string | null): AgentDefinition | undefined {
  if (!idOrSlug) return undefined;
  return AGENTS.find((a) => a.id === idOrSlug || a.slug === idOrSlug);
}

/** Keyword-based intent routing; keeps the current agent when nothing matches. */
export function classifyIntent(message: string, currentId?: string | null) {
  const text = message.toLowerCase();
  const current = findAgent(currentId) ?? DEFAULT_AGENT;
  let best: { agent: AgentDefinition; score: number } | null = null;
  for (const agent of AGENTS) {
    const score = agent.keywords.filter((k) => text.includes(k.toLowerCase())).length;
    if (score > 0 && (!best || score > best.score)) best = { agent, score };
  }
  if (!best || best.agent.id === current.id) return { agent: current, switched: false as const };
  return {
    agent: best.agent,
    switched: true as const,
    reason: `تم تحويلك إلى ${best.agent.name} حسب موضوع رسالتك.`,
  };
}
