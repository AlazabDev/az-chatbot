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
  parameters: Record<string, any>;
  execute: (args: any, context?: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export interface AgentContext {
  conversationId?: string;
  userId?: string;
  previousMessages?: ChatMessage[];
  metadata?: Record<string, any>;
}

export interface AgentExecutionResult {
  reply: string;
  toolExecuted?: {
    name: string;
    success: boolean;
    data?: any;
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
