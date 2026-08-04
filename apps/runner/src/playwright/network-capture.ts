import type { Page, Request, Response } from "playwright";
import type { NetworkEntry } from "@tuxedo-qa/shared";

const BODY_TRUNCATE_LENGTH = 5000;
const CAPTURED_RESOURCE_TYPES = new Set(["xhr", "fetch"]);

function truncate(text: string): string {
  return text.length > BODY_TRUNCATE_LENGTH ? `${text.slice(0, BODY_TRUNCATE_LENGTH)}… (truncated)` : text;
}

/**
 * Attaches a `response` listener that builds full NetworkEntry objects —
 * request/response bodies included for xhr/fetch calls (where BFF/analytics
 * payloads actually live), just the basics for everything else (images,
 * scripts, fonts — capturing those bodies would be pure noise).
 */
export function attachNetworkCapture(page: Page, onEntry: (entry: NetworkEntry) => void): void {
  page.on("response", (response) => {
    void handleResponse(response, onEntry);
  });
  // A request that never gets a response (DNS failure, connection refused,
  // aborted, timed out) fires no "response" event at all — without this, a
  // backend call that dies mid-flight is invisible to whoever's watching the
  // network tab, which is exactly the failure mode worth surfacing here.
  page.on("requestfailed", (request) => {
    onEntry({
      method: request.method(),
      url: request.url(),
      status: null,
      resourceType: request.resourceType(),
      timestamp: Date.now(),
      requestBody: request.postData() ?? undefined,
      failureText: request.failure()?.errorText ?? "unknown",
    });
  });
}

async function handleResponse(response: Response, onEntry: (entry: NetworkEntry) => void): Promise<void> {
  const request = response.request();
  const resourceType = request.resourceType();
  const entry: NetworkEntry = {
    method: request.method(),
    url: request.url(),
    status: response.status(),
    resourceType,
    timestamp: Date.now(),
  };

  if (CAPTURED_RESOURCE_TYPES.has(resourceType)) {
    const requestBody = request.postData();
    if (requestBody) entry.requestBody = truncate(requestBody);
    try {
      const responseText = await response.text();
      if (responseText) entry.responseBody = truncate(responseText);
    } catch {
      // body not readable (redirect, opaque response, already consumed) — leave it out
    }
  }

  onEntry(entry);
}
