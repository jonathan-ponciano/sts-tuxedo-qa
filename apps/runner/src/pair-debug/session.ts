import { randomUUID } from "node:crypto";
import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import type { Action, PairDebugEvent, PairDebugInputEvent } from "@tuxedo-qa/shared";
import { applyAction } from "../playwright/actions.ts";
import { attachNetworkCapture } from "../playwright/network-capture.ts";

interface Session {
  id: string;
  browser: Browser;
  page: Page;
  cdp: CDPSession;
  events: PairDebugEvent[];
  seq: number;
  listeners: Set<(e: PairDebugEvent) => void>;
  lastFrameBase64: string | null;
  frameListeners: Set<(frameBase64: string) => void>;
}

const sessions = new Map<string, Session>();

function record(session: Session, type: PairDebugEvent["type"], payload: Record<string, unknown>): void {
  session.seq += 1;
  const event: PairDebugEvent = { seq: session.seq, ts: Date.now(), type, payload };
  session.events.push(event);
  for (const listener of session.listeners) listener(event);
}

export async function startSession(
  url?: string,
  protectionHeaders?: Record<string, string>,
): Promise<{ sessionId: string }> {
  // headless:true works fine with CDP screencast — the renderer still paints
  // frames, there's just no OS-level window to show them in. This is what
  // let multiple sessions run per container at all: no more one shared Xvfb
  // display (:99) serialized behind a single noVNC endpoint.
  const browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage();
  if (protectionHeaders && Object.keys(protectionHeaders).length > 0) {
    await page.setExtraHTTPHeaders(protectionHeaders);
  }
  const cdp = await page.context().newCDPSession(page);
  const id = randomUUID();
  const session: Session = {
    id,
    browser,
    page,
    cdp,
    events: [],
    seq: 0,
    listeners: new Set(),
    lastFrameBase64: null,
    frameListeners: new Set(),
  };
  sessions.set(id, session);

  cdp.on("Page.screencastFrame", (frame) => {
    session.lastFrameBase64 = frame.data;
    for (const listener of session.frameListeners) listener(frame.data);
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });

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

  if (url) {
    try {
      await page.goto(url);
    } catch (err) {
      sessions.delete(id);
      await browser.close();
      throw err;
    }
  }

  return { sessionId: id };
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

/**
 * Screencast frames only arrive on repaint (navigation, animation, our own
 * dispatched input) — a viewer that subscribes between repaints would stare
 * at a blank canvas until the next one, so replay the last known frame
 * immediately if there is one.
 */
export function subscribeScreencast(sessionId: string, listener: (frameBase64: string) => void) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`pair-debug session ${sessionId} not found`);
  session.frameListeners.add(listener);
  if (session.lastFrameBase64) listener(session.lastFrameBase64);
  return { unsubscribe: () => session.frameListeners.delete(listener) };
}

const CDP_MOUSE_BUTTON: Record<NonNullable<Extract<PairDebugInputEvent, { type: "mouseDown" }>["button"]>, "left" | "right" | "middle"> = {
  left: "left",
  right: "right",
  middle: "middle",
};

/**
 * Forwards one browser-side input event straight to CDP, bypassing
 * Playwright's own `page.mouse`/`page.keyboard` (those serialize through
 * Playwright's action queue and don't accept "just relay whatever the human
 * is doing right now" semantics as cheaply as raw CDP calls do).
 */
export async function dispatchInput(sessionId: string, event: PairDebugInputEvent): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`pair-debug session ${sessionId} not found`);
  const { cdp } = session;

  switch (event.type) {
    case "mouseMove":
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: event.x, y: event.y });
      break;
    case "mouseDown":
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: event.x,
        y: event.y,
        button: CDP_MOUSE_BUTTON[event.button ?? "left"],
        clickCount: 1,
      });
      break;
    case "mouseUp":
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: event.x,
        y: event.y,
        button: CDP_MOUSE_BUTTON[event.button ?? "left"],
        clickCount: 1,
      });
      break;
    case "wheel":
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: event.x,
        y: event.y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      break;
    case "keyDown":
      await cdp.send("Input.dispatchKeyEvent", {
        type: event.text ? "keyDown" : "rawKeyDown",
        key: event.key,
        code: event.code,
        text: event.text,
      });
      break;
    case "keyUp":
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: event.key, code: event.code });
      break;
  }
}

/**
 * Lets the AI drive the same live page a human would over noVNC — one action
 * at a time. `applyAction` runs on `session.page`, which already has the
 * console/network/nav/click listeners from `startSession` wired up, so a
 * `click` or `goto` action shows up in `session.events` exactly like a
 * human-driven one; nothing extra to record here. Returns only the events
 * that action produced (seq > beforeSeq) plus a screenshot of the result,
 * so the caller sees what actually happened without re-fetching the whole
 * timeline.
 */
export async function stepSession(sessionId: string, action: Action): Promise<{ screenshotBase64: string; events: PairDebugEvent[] }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`pair-debug session ${sessionId} not found`);

  const beforeSeq = session.seq;
  await applyAction(session.page, action);
  // Same rationale as inspect_page: give the action's xhr/fetch calls a moment
  // to resolve before reading the screenshot/events, or bodies show up empty.
  await session.page.waitForTimeout(500);

  const screenshotBase64 = (await session.page.screenshot({ fullPage: true })).toString("base64");
  const events = session.events.filter((e) => e.seq > beforeSeq);
  return { screenshotBase64, events };
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
