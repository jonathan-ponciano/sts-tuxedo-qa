import { chromium } from "playwright";
import type { ElementInfo, InspectPageRequest, InspectPageResponse, NetworkEntry } from "@tuxedo-qa/shared";
import { applyAction } from "./actions.ts";
import { attachNetworkCapture } from "./network-capture.ts";

const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, [role=button], [role=link], [role=textbox], [contenteditable=true]";

interface RawElement {
  tag: string;
  text: string | null;
  role: string | null;
  testId: string | null;
  name: string | null;
  placeholder: string | null;
  labelText: string | null;
  visible: boolean;
  enabled: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  domPath: string;
}

export async function inspectPage(req: InspectPageRequest): Promise<InspectPageResponse> {
  const browser = await chromium.launch({ headless: true });
  const network: NetworkEntry[] = [];
  try {
    const context = await browser.newContext({ extraHTTPHeaders: req.headers });
    const page = await context.newPage();
    attachNetworkCapture(page, (entry) => network.push(entry));

    await page.goto(req.url, { waitUntil: "domcontentloaded" });
    for (const action of req.actions ?? []) await applyAction(page, action);
    // Response bodies are read asynchronously off the `response` event; give
    // the last action's XHR/fetch calls a moment to actually resolve before
    // we scrape elements and screenshot, or their bodies show up empty.
    await page.waitForTimeout(500);

    const raw = (await page.$$eval(INTERACTIVE_SELECTOR, (nodes) =>
      nodes.slice(0, 200).map((el) => {
        const rect = el.getBoundingClientRect();
        const id = el.getAttribute("id");
        let labelText: string | null = null;
        if (id) {
          const forLabel = document.querySelector(`label[for="${id}"]`);
          if (forLabel) labelText = forLabel.textContent?.trim() || null;
        }
        if (!labelText) {
          const wrapping = el.closest("label");
          if (wrapping) labelText = wrapping.textContent?.trim() || null;
        }
        if (!labelText) labelText = el.getAttribute("aria-label");
        // `tag:nth-of-type(N)` is only correct when N counts same-tag
        // siblings under the SAME parent — using the element's index in a
        // flat, mixed-tag list (as a prior version of this code did) matches
        // by coincidence at best, and produces a selector that resolves to
        // zero elements whenever this tag isn't the only interactive one
        // under its parent. Building the real ancestor chain (nth-child, not
        // nth-of-type — nth-child needs no same-tag assumption at all) up to
        // <body> guarantees the selector actually resolves to this element.
        let domPath = "";
        for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
          const parent = node.parentElement;
          if (!parent) break;
          const index = Array.prototype.indexOf.call(parent.children, node) + 1;
          const part = `${node.tagName.toLowerCase()}:nth-child(${index})`;
          domPath = domPath ? `${part} > ${domPath}` : part;
        }
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 120) || null,
          role: el.getAttribute("role"),
          testId: el.getAttribute("data-testid"),
          name: el.getAttribute("name"),
          placeholder: el.getAttribute("placeholder"),
          labelText,
          visible: rect.width > 0 && rect.height > 0,
          enabled: !("disabled" in el && (el as unknown as { disabled: boolean }).disabled),
          boundingBox: rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          domPath,
        };
      }),
    )) as RawElement[];

    const elements: ElementInfo[] = raw.map((el) => ({
      recommendedSelector: el.testId
        ? `[data-testid="${el.testId}"]`
        : el.name
          ? `${el.tag}[name="${el.name}"]`
          : el.placeholder
            ? `${el.tag}[placeholder="${el.placeholder}"]`
            : el.role
              ? `${el.tag}[role="${el.role}"]`
              : el.domPath,
      role: el.role,
      accessibleName: el.text ?? el.labelText ?? el.placeholder,
      testId: el.testId,
      name: el.name,
      placeholder: el.placeholder,
      labelText: el.labelText,
      tag: el.tag,
      text: el.text,
      visible: el.visible,
      enabled: el.enabled,
      boundingBox: el.boundingBox,
    }));

    const screenshotBase64 = (await page.screenshot({ fullPage: true })).toString("base64");
    return { elements, network, screenshotBase64 };
  } finally {
    await browser.close();
  }
}
