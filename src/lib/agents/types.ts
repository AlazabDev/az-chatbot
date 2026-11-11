// src/lib/agents/types.ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context?: AgentContext) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export interface AgentContext {
  conversationId?: string;
  userId?: string;
  previousMessages?: ChatMessage[];
  metadata?: Record<string, unknown>;
}

export interface AgentExecutionResult {
  reply: string;
  toolExecuted?: {
    name: string;
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

export interface BaseAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  keywords: string[];
  deploymentName: string;
  isDefault?: boolean;
  getSystemPrompt: (context?: AgentContext) => string;
  getTools?: () => AgentTool[];
  execute: (message: string, context: AgentContext) => Promise<AgentExecutionResult>;
}
