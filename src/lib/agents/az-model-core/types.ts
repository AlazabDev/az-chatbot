export type AgentSlug = "azabot" | "payments" | "project" | "bim" | "maint" | "prod" | "finance";

export interface AgentDefinition {
  slug: AgentSlug;
  /** Stable id, mirrors the folder name (az-agent-*). */
  id: string;
  name: string;
  description: string;
  keywords: string[];
  prompt: string;
  /** Tool names from the shared tool catalogue. */
  tools: string[];
  isDefault?: boolean;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRunResult {
  reply: string;
  toolExecuted?: { name: string; success: boolean; data?: Record<string, unknown> };
}
