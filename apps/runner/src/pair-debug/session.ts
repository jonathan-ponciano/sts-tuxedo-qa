import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import type { PairDebugEvent } from "@tuxedo-qa/shared";
import { attachNetworkCapture } from "../playwright/network-capture.ts";

interface Session {
  id: string;
  browser: Browser;
  events: PairDebugEvent[];
  seq: number;
  listeners: Set<(e: PairDebugEvent) => void>;
}

const sessions = new Map<string, Session>();

/**
 * v1 constraint: one active pair-debug session at a time, process-wide — the
 * headed browser runs on the single Xvfb display (:99) the container boots,
 * proxied through one noVNC endpoint. Multiple concurrent sessions would
 * need per-session displays/VNC ports, deferred until there's a real need.
 */
export function hasActiveSession(): boolean {
  return sessions.size > 0;
}

function record(session: Session, type: PairDebugEvent["type"], payload: Record<string, unknown>): void {
  session.seq += 1;
  const event: PairDebugEvent = { seq: session.seq, ts: Date.now(), type, payload };
  session.events.push(event);
  for (const listener of session.listeners) listener(event);
}

export async function startSession(
  url?: string,
  protectionHeaders?: Record<string, string>,
): Promise<{ sessionId: string; vncWsPath: string }> {
  if (hasActiveSession()) throw new Error("a pair-debug session is already active");

  // headless: false relies on DISPLAY (set to :99 by entrypoint.sh) pointing at the container's Xvfb.
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  const page: Page = await browser.newPage();
  if (protectionHeaders && Object.keys(protectionHeaders).length > 0) {
    await page.setExtraHTTPHeaders(protectionHeaders);
  }
  const id = randomUUID();
  const session: Session = { id, browser, events: [], seq: 0, listeners: new Set() };
  sessions.set(id, session);

  page.on("console", (msg) => record(session, "console", { text: msg.text(), level: msg.type() }));
  // Fired at response time (not request time) so status + body are available —
  // includes request/response bodies for xhr/fetch, letting whoever calls
  // get_pair_debug_context actually see the BFF/analytics payloads the human
  // triggered while driving, not just "a request happened".
  attachNetworkCapture(page, (entry) => record(session, "network", entry));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) record(session, "nav", { url: frame.url() });
  });

  await page.exposeBinding("__tuxedoRecordClick", (_source, selector: string) => record(session, "click", { selector }));
  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const testId = target.getAttribute("data-testid");
        const selector = testId ? `[data-testid="${testId}"]` : target.id ? `#${target.id}` : target.tagName.toLowerCase();
        (window as unknown as { __tuxedoRecordClick: (s: string) => void }).__tuxedoRecordClick(selector);
      },
      true,
    );
  });

  if (url) await page.goto(url);

  return { sessionId: id, vncWsPath: "/vnc" };
}

export function subscribeSession(sessionId: string, listener: (e: PairDebugEvent) => void) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`pair-debug session ${sessionId} not found`);
  session.listeners.add(listener);
  return {
    replay: [...session.events],
    unsubscribe: () => session.listeners.delete(listener),
  };
}

function buildDraftTest(events: PairDebugEvent[]): string {
  const lines = ['import { test } from "@playwright/test";', "", 'test("recorded from pair-debug", async ({ page }) => {'];
  for (const event of events) {
    if (event.type === "nav" && typeof event.payload.url === "string") {
      lines.push(`  await page.goto(${JSON.stringify(event.payload.url)});`);
    }
    if (event.type === "click" && typeof event.payload.selector === "string") {
      lines.push(`  await page.click(${JSON.stringify(event.payload.selector)});`);
    }
  }
  lines.push("});");
  return lines.join("\n");
}

export async function stopSession(sessionId: string): Promise<{ draftTestSource: string; events: PairDebugEvent[] }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`pair-debug session ${sessionId} not found`);
  await session.browser.close();
  sessions.delete(sessionId);
  return { draftTestSource: buildDraftTest(session.events), events: session.events };
}
