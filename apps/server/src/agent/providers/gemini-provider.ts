import type { AgentContentBlock } from "@tuxedo-qa/shared";
import { config } from "../../config.ts";
import type { AgentProvider, ProviderMessage, ProviderToolDef } from "./types.ts";

/**
 * Talks to the Generative Language API directly over REST rather than
 * pulling in a Gemini SDK — `alt=sse` on the streaming endpoint gets us
 * proper line-delimited SSE instead of the raw incrementally-parsed JSON
 * array `streamGenerateContent` returns by default, which is what the
 * official SDKs do internally anyway.
 *
 * Verified against a real API key — the request/response shapes matched
 * Google's docs on the first real call; the one real surprise was the
 * `parameters` schema restriction handled by sanitizeSchemaForGemini below.
 */

type GeminiRole = "user" | "model" | "function";

function toGeminiRole(message: ProviderMessage): GeminiRole {
  if (message.role === "assistant") return "model";
  return message.content.some((b) => b.type === "tool_result") ? "function" : "user";
}

function toGeminiPart(block: AgentContentBlock): Record<string, unknown> {
  if (block.type === "text") return { text: block.text ?? "" };
  if (block.type === "tool_use") return { functionCall: { name: block.name, args: block.input } };
  // tool_result — Gemini matches function responses to calls by name, not by
  // an id, so `name` (carried on our tool_result blocks specifically for
  // this) matters here in a way it doesn't for Anthropic.
  let response: unknown;
  try {
    response = block.content ? JSON.parse(block.content) : {};
  } catch {
    response = { result: block.content };
  }
  return { functionResponse: { name: block.name ?? "unknown", response } };
}

function toGeminiContents(messages: ProviderMessage[]): Array<{ role: GeminiRole; parts: Record<string, unknown>[] }> {
  return messages.map((m) => ({ role: toGeminiRole(m), parts: m.content.map(toGeminiPart) }));
}

/**
 * Gemini's function-declaration `parameters` field accepts a restricted
 * OpenAPI 3.0 subset, not full JSON Schema — confirmed against the real API,
 * which 400s on keywords `zod-to-json-schema` emits for our tool schemas
 * (nullable fields, e.g. `z.string().nullable()`, are the common source):
 *   - `additionalProperties` — unsupported, dropped (Gemini doesn't need it).
 *   - `const` — unsupported, rewritten as a single-value `enum` (semantically
 *     equivalent for a literal).
 *   - `type` as a JSON-Schema-style array (e.g. `["string","null"]`, how
 *     nullable fields render) — Gemini's `type` is a single non-repeated
 *     proto field, not a list. Collapsed to the first non-null entry, with
 *     `nullable: true` set if "null" was one of the options.
 */
function sanitizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForGemini);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "additionalProperties") continue;
      if (key === "const") {
        out.enum = [value];
        continue;
      }
      if (key === "type" && Array.isArray(value)) {
        const types = value as unknown[];
        out.type = types.find((t) => t !== "null") ?? "string";
        if (types.includes("null")) out.nullable = true;
        continue;
      }
      out[key] = sanitizeSchemaForGemini(value);
    }
    return out;
  }
  return node;
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: unknown } }> };
  }>;
}

async function* readSseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<GeminiStreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line) {
        const json = line.slice(5).trim();
        if (json && json !== "[DONE]") yield JSON.parse(json) as GeminiStreamChunk;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function createGeminiProvider(apiKey: string): AgentProvider {
  return {
    async runTurn({ systemPrompt, tools, messages, onTextDelta }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiChatModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const functionDeclarations = tools.map((t: ProviderToolDef) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeSchemaForGemini(t.inputSchema),
      }));

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: toGeminiContents(messages),
          tools: [{ functionDeclarations }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini API request failed: ${res.status} ${text}`);
      }

      const content: AgentContentBlock[] = [];
      const textIndexByPosition = new Map<number, number>(); // part index -> content[] index, so streamed text merges into one block
      let partIndex = 0;

      for await (const chunk of readSseJson(res.body)) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === "string") {
            onTextDelta(part.text);
            const existingIndex = textIndexByPosition.get(partIndex);
            if (existingIndex !== undefined && content[existingIndex]?.type === "text") {
              content[existingIndex].text = (content[existingIndex].text ?? "") + part.text;
            } else {
              textIndexByPosition.set(partIndex, content.length);
              content.push({ type: "text", text: part.text });
            }
          } else if (part.functionCall) {
            content.push({
              type: "tool_use",
              toolUseId: `${part.functionCall.name}_${content.length}`,
              name: part.functionCall.name,
              input: part.functionCall.args,
            });
          }
          partIndex += 1;
        }
      }

      return { content, stopReason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn" };
    },
  };
}
