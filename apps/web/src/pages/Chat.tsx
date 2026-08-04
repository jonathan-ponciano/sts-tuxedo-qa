import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { ChatMessageDTO, ChatStreamEvent, ChatThreadDTO } from "@tuxedo-qa/shared";
import { CredentialInlineForm } from "../components/CredentialInlineForm.tsx";
import { api } from "../lib/api.ts";

type FlatItem =
  | { kind: "user_text"; text: string }
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_call"; name: string; input: unknown }
  | { kind: "tool_result"; name?: string; ok: boolean; output: unknown };

function parseToolResultContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/** Provider-agnostic content-block array (see AgentContentBlock), straight from persisted messages — flattened into one chronological list for rendering. */
function flattenMessages(messages: ChatMessageDTO[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "text" && block.text) {
        items.push({ kind: message.role === "user" ? "user_text" : "assistant_text", text: block.text });
      } else if (block.type === "tool_use") {
        items.push({ kind: "tool_call", name: block.name ?? "?", input: block.input });
      } else if (block.type === "tool_result") {
        items.push({ kind: "tool_result", name: block.name, ok: !block.isError, output: parseToolResultContent(block.content) });
      }
    }
  }
  return items;
}

function FlatItemView({ item }: { item: FlatItem }) {
  if (item.kind === "user_text") return <p className="card">{item.text}</p>;
  if (item.kind === "assistant_text") return <p>{item.text}</p>;
  if (item.kind === "tool_call") {
    return (
      <pre className="log">
        → {item.name}({JSON.stringify(item.input)})
      </pre>
    );
  }
  return (
    <pre className="log" style={{ color: item.ok ? undefined : "var(--stop)" }}>
      ← {item.name ?? "tool"}: {JSON.stringify(item.output)}
    </pre>
  );
}

export function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const [threads, setThreads] = useState<ChatThreadDTO[] | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [items, setItems] = useState<FlatItem[]>([]);
  const [liveText, setLiveText] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitingCredentialId, setWaitingCredentialId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  if (!slug) return null;
  const projectSlug = slug;

  async function refreshThreads() {
    const { threads } = await api.listChatThreads(projectSlug);
    setThreads(threads);
    if (activeThreadId === null && threads[0]) setActiveThreadId(threads[0].id);
  }

  useEffect(() => {
    void refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThread(threadId: number) {
    const { messages, busy, waitingOnCredentialId } = await api.getChatThread(projectSlug, threadId);
    setItems(flattenMessages(messages));
    setBusy(busy);
    setWaitingCredentialId(waitingOnCredentialId);
    setLiveText("");
  }

  useEffect(() => {
    if (activeThreadId !== null) void loadThread(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  useEffect(() => {
    if (activeThreadId === null) return;
    const source = new EventSource(api.chatStreamUrl(projectSlug, activeThreadId));
    source.onmessage = (ev) => {
      const event = JSON.parse(ev.data) as ChatStreamEvent;
      if (event.kind === "text_delta") {
        setLiveText((prev) => prev + event.text);
      } else if (event.kind === "tool_call") {
        setItems((prev) => [...prev, { kind: "tool_call", name: event.name, input: event.input }]);
      } else if (event.kind === "tool_result") {
        setItems((prev) => [...prev, { kind: "tool_result", name: event.name, ok: event.ok, output: event.output }]);
      } else if (event.kind === "run_status") {
        setBusy(event.status === "running");
        if (event.status !== "running") void loadThread(activeThreadId);
        if (event.status === "error") setError(event.errorMessage ?? "erro desconhecido no agente");
      }
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug, activeThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, liveText]);

  async function handleNewThread() {
    const { thread } = await api.createChatThread(projectSlug);
    await refreshThreads();
    setActiveThreadId(thread.id);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThreadId || !input.trim()) return;
    setError(null);
    setItems((prev) => [...prev, { kind: "user_text", text: input }]);
    setLiveText("");
    setBusy(true);
    const text = input;
    setInput("");
    try {
      await api.sendChatMessage(projectSlug, activeThreadId, text);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "1.5rem" }}>
      <div style={{ minWidth: 200 }}>
        <button onClick={() => void handleNewThread()} style={{ width: "100%", marginBottom: 8 }}>
          + Nova conversa
        </button>
        {threads?.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveThreadId(t.id)}
            className="muted"
            style={{
              padding: "6px 8px",
              cursor: "pointer",
              color: t.id === activeThreadId ? "var(--ink)" : undefined,
              borderLeft: t.id === activeThreadId ? "2px solid var(--ink)" : "2px solid transparent",
            }}
          >
            {t.title}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {activeThreadId === null ? (
          <p className="muted">Crie uma conversa para começar.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {items.map((item, i) => (
                <FlatItemView key={i} item={item} />
              ))}
              {liveText && <p>{liveText}</p>}
              {busy && !liveText && <p className="muted">pensando…</p>}
              {waitingCredentialId !== null && (
                <CredentialInlineForm
                  slug={projectSlug}
                  credentialId={waitingCredentialId}
                  onFulfilled={() => setWaitingCredentialId(null)}
                />
              )}
              <div ref={bottomRef} />
            </div>

            {error && <p style={{ color: "var(--stop)" }}>{error}</p>}

            <form className="form-row" onSubmit={(e) => void handleSend(e)}>
              <input
                type="text"
                placeholder="Peça pro agente navegar um fluxo, criar um teste, etc."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <button className="primary" type="submit" disabled={busy || !input.trim()}>
                Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
