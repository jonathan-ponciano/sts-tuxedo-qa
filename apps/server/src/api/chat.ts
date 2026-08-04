import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { ChatMessageDTO, ChatThreadDTO } from "@tuxedo-qa/shared";
import { hasLlmProviderConfigured, isThreadBusy, runAgentTurn } from "../agent/agent-loop.ts";
import type { ChatMessageRow, ChatThreadRow } from "../mcp/rows.ts";
import { subscribeToChatEvents } from "../streaming/chat-hub.ts";

export const chatRouter = new Hono();

function threadToDTO(row: ChatThreadRow): ChatThreadDTO {
  return { id: row.id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function messageToDTO(row: ChatMessageRow): ChatMessageDTO {
  return { id: row.id, role: row.role, content: JSON.parse(row.content), createdAt: row.created_at };
}

chatRouter.get("/threads", (c) => {
  const ctx = c.get("project");
  const rows = ctx.db.query("SELECT * FROM chat_threads ORDER BY updated_at DESC").all() as ChatThreadRow[];
  return c.json({ threads: rows.map(threadToDTO) });
});

const createThreadSchema = z.object({ title: z.string().min(1).optional() });

chatRouter.post("/threads", async (c) => {
  const ctx = c.get("project");
  const parsed = createThreadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const title = parsed.data.title ?? "Nova conversa";
  const { lastInsertRowid } = ctx.db.run("INSERT INTO chat_threads (title) VALUES (?1)", [title]);
  const thread = ctx.db.query("SELECT * FROM chat_threads WHERE id = ?1").get(Number(lastInsertRowid)) as ChatThreadRow;
  return c.json({ thread: threadToDTO(thread) }, 201);
});

chatRouter.get("/threads/:id", (c) => {
  const ctx = c.get("project");
  const threadId = Number(c.req.param("id"));
  const thread = ctx.db.query("SELECT * FROM chat_threads WHERE id = ?1").get(threadId) as ChatThreadRow | null;
  if (!thread) return c.json({ error: "thread_not_found" }, 404);
  const messages = ctx.db.query("SELECT * FROM chat_messages WHERE thread_id = ?1 ORDER BY id ASC").all(threadId) as ChatMessageRow[];
  // So a page refresh (not just the live SSE) still shows the inline
  // credential form if this thread's last turn is parked waiting on one.
  const waitingRun = ctx.db
    .query("SELECT waiting_on_credential_id FROM agent_runs WHERE thread_id = ?1 AND status = 'waiting_input' ORDER BY id DESC LIMIT 1")
    .get(threadId) as { waiting_on_credential_id: number | null } | null;
  return c.json({
    thread: threadToDTO(thread),
    messages: messages.map(messageToDTO),
    busy: isThreadBusy(threadId),
    waitingOnCredentialId: waitingRun?.waiting_on_credential_id ?? null,
  });
});

const sendMessageSchema = z.object({ text: z.string().min(1) });

chatRouter.post("/threads/:id/messages", async (c) => {
  const ctx = c.get("project");
  const threadId = Number(c.req.param("id"));
  const thread = ctx.db.query("SELECT id FROM chat_threads WHERE id = ?1").get(threadId);
  if (!thread) return c.json({ error: "thread_not_found" }, 404);

  const parsed = sendMessageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  if (isThreadBusy(threadId)) return c.json({ error: "thread_busy" }, 409);
  if (!hasLlmProviderConfigured(ctx)) return c.json({ error: "llm_not_configured" }, 400);

  // Fire-and-forget from this handler's perspective — the caller follows up
  // on /stream for progress, same 202-then-SSE shape as triggerRun.
  void runAgentTurn(ctx, threadId, parsed.data.text).catch((err) => {
    console.error(`agent turn failed for thread ${threadId}:`, err);
  });
  return c.json({ accepted: true }, 202);
});

const PROMOTE_PROMPT =
  "Salve o fluxo que validamos nesta conversa como um teste agendado, chamando create_test com um script Playwright " +
  "baseado exatamente no que fizemos aqui (seletores reais observados, não adivinhados). Escolha um nome e uma " +
  "descrição claros para o teste.";

// "Salvar como teste fixo" button in Chat.tsx — same 202-then-SSE shape as a
// normal message, just with a fixed prompt and the resulting test tagged
// with this thread (see agent-loop.ts's tagCreatedTestsWithThreadId).
chatRouter.post("/threads/:id/promote", (c) => {
  const ctx = c.get("project");
  const threadId = Number(c.req.param("id"));
  const thread = ctx.db.query("SELECT id FROM chat_threads WHERE id = ?1").get(threadId);
  if (!thread) return c.json({ error: "thread_not_found" }, 404);
  if (isThreadBusy(threadId)) return c.json({ error: "thread_busy" }, 409);
  if (!hasLlmProviderConfigured(ctx)) return c.json({ error: "llm_not_configured" }, 400);

  void runAgentTurn(ctx, threadId, PROMOTE_PROMPT, { tagCreatedTestsWithThreadId: true }).catch((err) => {
    console.error(`promote turn failed for thread ${threadId}:`, err);
  });
  return c.json({ accepted: true }, 202);
});

// Stays open for the thread's whole lifetime (not just one turn) — a chat
// keeps going across many messages, unlike a test run's SSE which closes
// once that one run finishes.
chatRouter.get("/threads/:id/stream", (c) => {
  const threadId = Number(c.req.param("id"));
  return streamSSE(c, async (stream) => {
    const { replay, unsubscribe } = subscribeToChatEvents(threadId, (event) => {
      void stream.writeSSE({ data: JSON.stringify(event) });
    });
    for (const event of replay) await stream.writeSSE({ data: JSON.stringify(event) });
    stream.onAbort(() => unsubscribe());
    while (!c.req.raw.signal?.aborted) await stream.sleep(15000);
    unsubscribe();
  });
});
