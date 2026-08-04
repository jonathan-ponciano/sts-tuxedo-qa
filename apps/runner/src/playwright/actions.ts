import type { Page } from "playwright";
import type { Action } from "@tuxedo-qa/shared";

/** Shared by inspect_page's one-shot action list and pair-debug's step-by-step driving. */
export async function applyAction(page: Page, action: Action): Promise<void> {
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
    case "clickAt":
      await page.mouse.click(action.x, action.y);
      break;
    case "scrollTo":
      await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: action.x, y: action.y });
      break;
  }
}
