import { chromium, type Page } from "playwright";
import type { Action, ElementInfo, InspectPageRequest, InspectPageResponse, NetworkEntry } from "@tuxedo-qa/shared";

const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, [role=button], [role=link], [role=textbox], [contenteditable=true]";

async function applyAction(page: Page, action: Action): Promise<void> {
  switch (action.type) {
    case "click":
      await page.click(action.selector);
      break;
    case "fill":
      await page.fill(action.selector, action.value);
      break;
    case "press":
      if (action.selector) await page.press(action.selector, action.key);
      else await page.keyboard.press(action.key);
      break;
    case "select":
      await page.selectOption(action.selector, action.value);
      break;
    case "waitFor":
      await page.waitForSelector(action.selector, { state: action.state });
      break;
    case "goto":
      await page.goto(action.url);
      break;
  }
}

interface RawElement {
  tag: string;
  text: string | null;
  role: string | null;
  testId: string | null;
  visible: boolean;
  enabled: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export async function inspectPage(req: InspectPageRequest): Promise<InspectPageResponse> {
  const browser = await chromium.launch({ headless: true });
  const network: NetworkEntry[] = [];
  try {
    const context = await browser.newContext({ extraHTTPHeaders: req.headers });
    const page = await context.newPage();
    page.on("response", (res) => {
      network.push({
        method: res.request().method(),
        url: res.url(),
        status: res.status(),
        resourceType: res.request().resourceType(),
        timestamp: Date.now(),
      });
    });

    await page.goto(req.url, { waitUntil: "domcontentloaded" });
    for (const action of req.actions ?? []) await applyAction(page, action);

    const raw = (await page.$$eval(INTERACTIVE_SELECTOR, (nodes) =>
      nodes.slice(0, 200).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 120) || null,
          role: el.getAttribute("role"),
          testId: el.getAttribute("data-testid"),
          visible: rect.width > 0 && rect.height > 0,
          enabled: !("disabled" in el && (el as unknown as { disabled: boolean }).disabled),
          boundingBox: rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        };
      }),
    )) as RawElement[];

    const elements: ElementInfo[] = raw.map((el, i) => ({
      recommendedSelector: el.testId
        ? `[data-testid="${el.testId}"]`
        : el.role
          ? `${el.tag}[role="${el.role}"]`
          : `${el.tag}:nth-of-type(${i + 1})`,
      role: el.role,
      accessibleName: el.text,
      testId: el.testId,
      tag: el.tag,
      text: el.text,
      visible: el.visible,
      enabled: el.enabled,
      boundingBox: el.boundingBox,
    }));

    const screenshotBase64 = (await page.screenshot()).toString("base64");
    return { elements, network, screenshotBase64 };
  } finally {
    await browser.close();
  }
}
