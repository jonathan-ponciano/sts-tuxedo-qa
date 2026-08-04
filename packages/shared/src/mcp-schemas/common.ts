import { z } from "zod";

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), selector: z.string() }),
  z.object({ type: z.literal("fill"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("press"), selector: z.string().optional(), key: z.string() }),
  z.object({ type: z.literal("select"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("waitFor"), selector: z.string(), state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible") }),
  z.object({ type: z.literal("goto"), url: z.string() }),
  // Escape valve for custom widgets with no usable selector — e.g. a combobox
  // whose visible click target is a plain unlabeled <div>, with only a
  // disabled/readonly proxy <input> in the DOM. Coordinates normally come
  // from a previous inspect_page call's elements[].boundingBox center.
  z.object({ type: z.literal("clickAt"), x: z.number(), y: z.number() }),
  // clickAt uses viewport-relative coordinates from a prior boundingBox —
  // useless if the page has since scrolled that element out of view (e.g.
  // an autoscroll after a field validates). scrollTo re-anchors the viewport
  // to an absolute page position before a follow-up clickAt.
  z.object({ type: z.literal("scrollTo"), x: z.number().default(0), y: z.number() }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ElementInfoSchema = z.object({
  recommendedSelector: z.string(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  testId: z.string().nullable(),
  // Inputs rarely have textContent — placeholder/name/label are what real
  // pages actually use to identify a form field, and what a human would
  // target with getByPlaceholder/getByLabel. Without these, every unlabeled
  // input falls back to a fragile nth-of-type selector.
  name: z.string().nullable(),
  placeholder: z.string().nullable(),
  labelText: z.string().nullable(),
  tag: z.string(),
  text: z.string().nullable(),
  visible: z.boolean(),
  enabled: z.boolean(),
  boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
});
export type ElementInfo = z.infer<typeof ElementInfoSchema>;

export const NetworkEntrySchema = z.object({
  method: z.string(),
  url: z.string(),
  status: z.number().nullable(),
  resourceType: z.string(),
  timestamp: z.number(),
  // Only populated for xhr/fetch — capturing bodies for every asset request
  // (images, JS bundles, fonts) would be wasteful and mostly noise. Truncated
  // to keep MCP responses/pair-debug timelines from ballooning on large payloads.
  requestBody: z.string().nullable().optional(),
  responseBody: z.string().nullable().optional(),
  // Only set when the request never got a response at all (see
  // attachNetworkCapture's requestfailed handler) — e.g. "net::ERR_CONNECTION_REFUSED".
  failureText: z.string().nullable().optional(),
});
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;

export const RunStatusSchema = z.enum(["queued", "running", "passed", "failed", "error", "timeout"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunTriggerSchema = z.enum(["manual", "scheduled", "ci", "run_until_pass"]);
export type RunTrigger = z.infer<typeof RunTriggerSchema>;

export const PairDebugEventTypeSchema = z.enum(["console", "network", "nav", "click"]);

export const PairDebugEventSchema = z.object({
  seq: z.number(),
  ts: z.number(),
  type: PairDebugEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type PairDebugEvent = z.infer<typeof PairDebugEventSchema>;
