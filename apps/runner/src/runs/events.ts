import type { RunProgressEvent } from "@tuxedo-qa/shared";

interface RunState {
  events: RunProgressEvent[];
  listeners: Set<(e: RunProgressEvent) => void>;
  done: boolean;
}

const runs = new Map<number, RunState>();

function getOrCreate(runId: number): RunState {
  let state = runs.get(runId);
  if (!state) {
    state = { events: [], listeners: new Set(), done: false };
    runs.set(runId, state);
  }
  return state;
}

export function emit(runId: number, event: RunProgressEvent): void {
  const state = getOrCreate(runId);
  state.events.push(event);
  for (const listener of state.listeners) listener(event);
  if (event.kind === "status") state.done = true;
}

export function subscribe(runId: number, listener: (e: RunProgressEvent) => void) {
  const state = getOrCreate(runId);
  state.listeners.add(listener);
  return {
    replay: [...state.events],
    isDone: () => state.done,
    unsubscribe: () => state.listeners.delete(listener),
  };
}

/** Bounded retention: forget a run's buffered events a while after it finishes. */
export function scheduleCleanup(runId: number, delayMs = 5 * 60_000): void {
  setTimeout(() => runs.delete(runId), delayMs);
}
