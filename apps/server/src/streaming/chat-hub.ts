import type { AgentRunStatus, ChatStreamEvent } from "@tuxedo-qa/shared";

type Listener = (event: ChatStreamEvent) => void;

interface ThreadBuffer {
  events: ChatStreamEvent[];
  runStatus: AgentRunStatus | null;
}

const subscribers = new Map<number, Set<Listener>>();
const buffers = new Map<number, ThreadBuffer>();
const MAX_BUFFERED_EVENTS = 500;

function getOrCreateBuffer(threadId: number): ThreadBuffer {
  let buf = buffers.get(threadId);
  if (!buf) {
    buf = { events: [], runStatus: null };
    buffers.set(threadId, buf);
  }
  return buf;
}

/** A dashboard tab opening its SSE connection after a turn already produced some events still sees them via replay — same rationale as streaming/hub.ts's run buffer. */
export function subscribeToChatEvents(threadId: number, listener: Listener) {
  const buf = getOrCreateBuffer(threadId);
  let set = subscribers.get(threadId);
  if (!set) {
    set = new Set();
    subscribers.set(threadId, set);
  }
  set.add(listener);
  return {
    replay: [...buf.events],
    unsubscribe: () => {
      set?.delete(listener);
      if (set?.size === 0) subscribers.delete(threadId);
    },
  };
}

export function broadcastChatEvent(threadId: number, event: ChatStreamEvent): void {
  const buf = getOrCreateBuffer(threadId);
  buf.events.push(event);
  // Bounded: this buffer is only for a late-joining SSE tab to catch up on
  // the CURRENT turn, not a substitute for chat_messages' full history.
  if (buf.events.length > MAX_BUFFERED_EVENTS) buf.events.shift();
  if (event.kind === "run_status") buf.runStatus = event.status;
  for (const listener of subscribers.get(threadId) ?? []) listener(event);
}

export function isThreadRunning(threadId: number): boolean {
  return buffers.get(threadId)?.runStatus === "running";
}
