import type { AgentContentBlock } from "@tuxedo-qa/shared";
import { config } from "../config.ts";
import { decryptSecret } from "../crypto/index.ts";
import type { ProjectContext } from "../db/project-context.ts";
import { findLlmCredential, type LlmProvider } from "../db/registry.ts";
import { broadcastChatEvent } from "../streaming/chat-hub.ts";
import { createAnthropicProvider } from "./providers/anthropic-provider.ts";
import { createGeminiProvider } from "./providers/gemini-provider.ts";
import type { AgentProvider, ProviderMessage } from "./providers/types.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { buildToolDefs, runTool } from "./tool-adapter.ts";

// Bounds how many model <-> tool round-trips a single user turn can spend —
// same rationale as `run_until_pass`'s `maxAttempts`: an embedded chat agent
// is a direct LLM-cost sink for this product (unlike the external-MCP path,
// where the caller's own client pays for its own model calls), so a turn
// that somehow loops forever must hit a wall instead of running unbounded.
const MAX_TOOL_ITERATIONS = 15;

interface ChatMessageRow {
  id: number;
  thread_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function loadHistory(ctx: ProjectContext, threadId: number): ProviderMessage[] {
  const rows = ctx.db
    .query("SELECT * FROM chat_messages WHERE thread_id = ?1 ORDER BY id ASC")
    .all(threadId) as ChatMessageRow[];
  return rows.map((r) => ({ role: r.role, content: JSON.parse(r.content) as AgentContentBlock[] }));
}

function saveMessage(ctx: ProjectContext, threadId: number, role: "user" | "assistant", content: AgentContentBlock[]): void {
  ctx.db.run("INSERT INTO chat_messages (thread_id, role, content) VALUES (?1, ?2, ?3)", [threadId, role, JSON.stringify(content)]);
  ctx.db.run("UPDATE chat_threads SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", [threadId]);
}

function finishRun(ctx: ProjectContext, runId: number, status: "completed" | "error", errorMessage?: string): void {
  ctx.db.run(
    "UPDATE agent_runs SET status = ?1, error_message = ?2, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?3",
    [status, errorMessage ?? null, runId],
  );
}

/**
 * Prefers the account's own key (saved via the dashboard's settings panel —
 * see api/account.ts) over the server-wide `ANTHROPIC_API_KEY` env var, which
 * exists only as a local/self-hosted bootstrapping convenience. Anthropic
 * wins if both providers are configured for an account — arbitrary but
 * consistent tie-break, since a thread can't split itself across providers
 * mid-conversation anyway.
 */
function resolveProvider(ctx: ProjectContext): AgentProvider {
  const accountKey = (provider: LlmProvider): string | null => {
    if (ctx.accountId === null) return null;
    const row = findLlmCredential(ctx.accountId, provider);
    return row ? decryptSecret(Buffer.from(row.secret_blob)) : null;
  };

  const anthropicKey = accountKey("anthropic") ?? config.anthropicApiKey ?? null;
  if (anthropicKey) return createAnthropicProvider(anthropicKey);

  const geminiKey = accountKey("gemini");
  if (geminiKey) return createGeminiProvider(geminiKey);

  throw new Error("no LLM provider configured for this account — add a Claude or Gemini API key in Configurações");
}

const runningThreads = new Set<number>();

export function isThreadBusy(threadId: number): boolean {
  return runningThreads.has(threadId);
}

/** Lets the route handler reject a message with a clear 4xx immediately, instead of accepting it (202) and failing silently in the background. */
export function hasLlmProviderConfigured(ctx: ProjectContext): boolean {
  try {
    resolveProvider(ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs one user turn to completion: sends the message, lets the model call
 * tools and read their results back and forth (bounded by
 * `MAX_TOOL_ITERATIONS`), and stops when the model produces a plain text
 * reply, a `request_credential` call is left pending, or an error occurs.
 * Meant to be kicked off and NOT awaited by the HTTP handler that calls it
 * (see api/chat.ts's 202-then-stream pattern) — progress goes out over
 * `chat-hub.ts`'s SSE, not the return value.
 */
export async function runAgentTurn(ctx: ProjectContext, threadId: number, userText: string): Promise<void> {
  if (runningThreads.has(threadId)) throw new Error(`thread ${threadId} already has a turn in progress`);
  const provider = resolveProvider(ctx);

  runningThreads.add(threadId);
  const { lastInsertRowid } = ctx.db.run("INSERT INTO agent_runs (thread_id, status) VALUES (?1, 'running')", [threadId]);
  const runId = Number(lastInsertRowid);

  try {
    saveMessage(ctx, threadId, "user", [{ type: "text", text: userText }]);
    broadcastChatEvent(threadId, { kind: "run_status", status: "running", ts: Date.now() });

    const tools = buildToolDefs();
    const messages = loadHistory(ctx, threadId);
    const systemPrompt = buildSystemPrompt(ctx.slug);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const result = await provider.runTurn({
        systemPrompt,
        tools,
        messages,
        onTextDelta: (text) => broadcastChatEvent(threadId, { kind: "text_delta", text, ts: Date.now() }),
      });

      saveMessage(ctx, threadId, "assistant", result.content);
      messages.push({ role: "assistant", content: result.content });

      if (result.stopReason !== "tool_use") {
        finishRun(ctx, runId, "completed");
        broadcastChatEvent(threadId, { kind: "run_status", status: "completed", ts: Date.now() });
        return;
      }

      const toolUseBlocks = result.content.filter((b) => b.type === "tool_use");
      const toolResults: AgentContentBlock[] = [];
      let waitingCredentialId: number | null = null;

      for (const block of toolUseBlocks) {
        broadcastChatEvent(threadId, { kind: "tool_call", name: block.name ?? "?", input: block.input, ts: Date.now() });
        const callResult = await runTool(ctx, block.name ?? "", block.input);
        broadcastChatEvent(threadId, {
          kind: "tool_result",
          name: block.name ?? "?",
          ok: callResult.ok,
          output: callResult.output,
          ts: Date.now(),
        });

        // A pending `request_credential` means the human needs to act in the
        // dashboard before this turn can go further — park here rather than
        // let the model spin on a tool that will keep returning "pending".
        if (block.name === "request_credential" && callResult.ok) {
          const output = callResult.output as { credentialId: number; status: string };
          if (output.status === "pending") waitingCredentialId = output.credentialId;
        }

        toolResults.push({
          type: "tool_result",
          toolUseId: block.toolUseId,
          name: block.name, // not needed by Anthropic, but Gemini matches function responses by name, not id
          content: JSON.stringify(callResult.output),
          isError: !callResult.ok,
        });
      }

      saveMessage(ctx, threadId, "user", toolResults);
      messages.push({ role: "user", content: toolResults });

      if (waitingCredentialId !== null) {
        ctx.db.run("UPDATE agent_runs SET status = 'waiting_input', waiting_on_credential_id = ?1 WHERE id = ?2", [
          waitingCredentialId,
          runId,
        ]);
        broadcastChatEvent(threadId, { kind: "run_status", status: "waiting_input", waitingOnCredentialId: waitingCredentialId, ts: Date.now() });
        return;
      }
    }

    const message = `stopped after ${MAX_TOOL_ITERATIONS} tool round-trips without a final answer`;
    finishRun(ctx, runId, "error", message);
    broadcastChatEvent(threadId, { kind: "run_status", status: "error", errorMessage: message, ts: Date.now() });
  } catch (err) {
    finishRun(ctx, runId, "error", (err as Error).message);
    broadcastChatEvent(threadId, { kind: "run_status", status: "error", errorMessage: (err as Error).message, ts: Date.now() });
  } finally {
    runningThreads.delete(threadId);
  }
}
