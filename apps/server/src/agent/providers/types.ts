import type { AgentContentBlock } from "@tuxedo-qa/shared";

export interface ProviderToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderMessage {
  role: "user" | "assistant";
  content: AgentContentBlock[];
}

export interface ProviderTurnResult {
  content: AgentContentBlock[];
  stopReason: "tool_use" | "end_turn";
}

/** One implementation per LLM backend — agent-loop.ts only talks to this interface, never to a provider's SDK/REST shape directly. */
export interface AgentProvider {
  runTurn(params: {
    systemPrompt: string;
    tools: ProviderToolDef[];
    messages: ProviderMessage[];
    onTextDelta: (text: string) => void;
  }): Promise<ProviderTurnResult>;
}
