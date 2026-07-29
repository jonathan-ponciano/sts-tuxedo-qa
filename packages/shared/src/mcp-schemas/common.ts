import { z } from "zod";

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), selector: z.string() }),
  z.object({ type: z.literal("fill"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("press"), selector: z.string().optional(), key: z.string() }),
  z.object({ type: z.literal("select"), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal("waitFor"), selector: z.string(), state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible") }),
  z.object({ type: z.literal("goto"), url: z.string() }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ElementInfoSchema = z.object({
  recommendedSelector: z.string(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  testId: z.string().nullable(),
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
