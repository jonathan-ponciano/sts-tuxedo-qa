import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, MessageParam, Tool, ToolResultBlockParam, ToolUseBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { AgentContentBlock } from "@tuxedo-qa/shared";
import { config } from "../../config.ts";
import type { AgentProvider, ProviderMessage } from "./types.ts";

function toAnthropicBlock(b: AgentContentBlock): { type: "text"; text: string } | ToolUseBlockParam | ToolResultBlockParam {
  if (b.type === "text") return { type: "text", text: b.text ?? "" };
  if (b.type === "tool_use") return { type: "tool_use", id: b.toolUseId ?? "", name: b.name ?? "", input: b.input };
  return { type: "tool_result", tool_use_id: b.toolUseId ?? "", content: b.content, is_error: b.isError };
}

function fromAnthropicBlock(b: ContentBlock): AgentContentBlock {
  if (b.type === "text") return { type: "text", text: b.text };
  return { type: "tool_use", toolUseId: b.id, name: b.name, input: b.input };
}

function toAnthropicMessages(messages: ProviderMessage[]): MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content.map(toAnthropicBlock) }));
}

export function createAnthropicProvider(apiKey: string): AgentProvider {
  const client = new Anthropic({ apiKey });
  return {
    async runTurn({ systemPrompt, tools, messages, onTextDelta }) {
      const stream = client.messages.stream({
        model: config.chatModel,
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools.map((t): Tool => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Tool.InputSchema })),
        messages: toAnthropicMessages(messages),
      });
      stream.on("text", (text) => onTextDelta(text));
      const finalMessage = await stream.finalMessage();
      return {
        content: finalMessage.content.map(fromAnthropicBlock),
        stopReason: finalMessage.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      };
    },
  };
}
