import { z } from "zod";
import { ActionSchema, ElementInfoSchema, NetworkEntrySchema, PairDebugEventSchema, RunStatusSchema, RunTriggerSchema } from "./common.ts";

/**
 * Every one of the 18 MCP tools from the PRD, as a name -> {input,output} schema pair.
 * `IMPLEMENTED_TOOLS` marks which ones have a real handler in this pass; the rest are
 * registered with full schemas but a `not_implemented` stub handler.
 */

const TestSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  validated: z.boolean(),
  schedule: z.string().nullable(),
  lastRunStatus: RunStatusSchema.nullable(),
  lastRunAt: z.string().nullable(),
});

const TestDetailSchema = TestSummarySchema.extend({
  filePath: z.string(),
  script: z.string(),
  createdBy: z.enum(["ai", "human"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const toolSchemas = {
  // ---- discovery / creation ----
  inspect_page: {
    description: "Open a URL headless, report interactive elements with recommended selectors, optionally simulate actions first.",
    input: z.object({
      url: z.string().url(),
      actions: z.array(ActionSchema).optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    output: z.object({
      elements: z.array(ElementInfoSchema),
      network: z.array(NetworkEntrySchema),
      screenshotBase64: z.string().nullable(),
    }),
  },
  create_test: {
    description: "Write a new Playwright spec file from AI-generated source; dry-runs it before marking validated.",
    input: z.object({
      name: z.string(),
      description: z.string().optional(),
      script: z.string(),
      schedule: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
    }),
    output: z.object({
      testId: z.number(),
      validated: z.literal(false),
      dryRun: z.object({ ok: z.boolean(), errors: z.array(z.string()).optional() }),
    }),
  },
  start_pair_debug: {
    description: "Open a visible browser for a human to drive; records console/network/nav/click events.",
    input: z.object({ url: z.string().url().optional() }),
    output: z.object({ sessionId: z.number(), vncWsPath: z.string() }),
  },
  get_pair_debug_context: {
    description: "Return the recorded timeline of an in-progress pair-debug session.",
    input: z.object({ sessionId: z.number() }),
    output: z.object({ events: z.array(PairDebugEventSchema) }),
  },
  stop_pair_debug: {
    description: "End a pair-debug session and return a draft Playwright test built from the human's actions.",
    input: z.object({ sessionId: z.number() }),
    output: z.object({ draftTestSource: z.string(), events: z.array(PairDebugEventSchema) }),
  },

  // ---- test management ----
  list_tests: {
    description: "List tests with status, schedule and filters.",
    input: z.object({
      validated: z.boolean().optional(),
      tag: z.string().optional(),
    }),
    output: z.object({ tests: z.array(TestSummarySchema) }),
  },
  read_test: {
    description: "Read a test's script, metadata and schedule.",
    input: z.object({ testId: z.number() }),
    output: TestDetailSchema,
  },
  update_test: {
    description: "Edit a test's script, name, description, schedule or active state.",
    input: z.object({
      testId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      script: z.string().optional(),
      schedule: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
    }),
    output: TestDetailSchema,
  },
  delete_test: {
    description: "Remove a test and its run history. Irreversible; prefer update_test to deactivate.",
    input: z.object({ testId: z.number() }),
    output: z.object({ deleted: z.literal(true) }),
  },
  run_tests: {
    description: "Run all tests or one specific test; fires the configured webhook on completion.",
    input: z.object({ testId: z.number().optional() }),
    output: z.object({ runId: z.number(), status: RunStatusSchema }),
  },
  run_until_pass: {
    description: "Run a test, apply an automatic fix on failure, repeat until it passes or the attempt limit is hit.",
    input: z.object({ testId: z.number(), maxAttempts: z.number().int().min(1).max(10).default(3) }),
    output: z.object({ runId: z.number(), attempts: z.number(), status: RunStatusSchema }),
  },
  get_status: {
    description: "Suite-wide status, or per-test status with failure diagnosis and fix suggestion.",
    input: z.object({ testId: z.number().optional() }),
    output: z.object({
      testId: z.number().nullable(),
      status: RunStatusSchema.nullable(),
      diagnosis: z.string().nullable(),
      suggestion: z.string().nullable(),
      suiteSummary: z.object({ total: z.number(), passing: z.number(), failing: z.number() }).optional(),
    }),
  },
  pause_tests: {
    description: "Pause the whole suite for up to 60 minutes, e.g. during a deploy.",
    input: z.object({ minutes: z.number().int().min(1).max(60) }),
    output: z.object({ pausedUntil: z.string() }),
  },

  // ---- credentials / notifications ----
  request_credential: {
    description: "Ask the human to fill a credential directly in the dashboard. The value never passes through this conversation.",
    input: z.object({ name: z.string(), description: z.string().optional() }),
    output: z.object({ credentialId: z.number(), status: z.literal("pending") }),
  },
  create_credential: {
    description: "Persist a credential the user already pasted into the conversation themselves.",
    input: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    output: z.object({ credentialId: z.number(), status: z.literal("fulfilled") }),
  },
  list_credentials: {
    description: "List saved credential sets with masked values.",
    input: z.object({}),
    output: z.object({
      credentials: z.array(z.object({
        id: z.number(),
        name: z.string(),
        description: z.string().nullable(),
        status: z.enum(["pending", "fulfilled"]),
      })),
    }),
  },
  delete_credential: {
    description: "Remove a saved credential set.",
    input: z.object({ credentialId: z.number() }),
    output: z.object({ deleted: z.literal(true) }),
  },
  set_webhook: {
    description: "Configure a result notification webhook (Discord, Slack or a generic JSON endpoint).",
    input: z.object({
      kind: z.enum(["discord", "slack", "generic"]),
      url: z.string().url(),
      events: z.array(z.enum(["pass", "fail", "error"])).default(["fail", "error"]),
    }),
    output: z.object({ webhookId: z.number() }),
  },
} satisfies Record<string, { description: string; input: z.ZodTypeAny; output: z.ZodTypeAny }>;

// Exactly the 18 tools from the PRD. The CI trigger path (`ci-run-test` /
// repository_dispatch) is NOT an MCP tool — CI isn't an AI-assistant MCP
// client. It calls the same internal `triggerRun` function directly via a
// plain REST endpoint, deliberately bypassing the `validated` gate.

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]["input"]>;
export type ToolOutput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]["output"]>;

/** All 18 tools now have a real handler — kept as an explicit list (rather than deriving it from the registry) so a future new tool defaults to "needs a decision", not silently "implemented". */
export const IMPLEMENTED_TOOLS: ToolName[] = [
  "inspect_page",
  "create_test",
  "list_tests",
  "read_test",
  "update_test",
  "delete_test",
  "run_tests",
  "run_until_pass",
  "pause_tests",
  "get_status",
  "request_credential",
  "create_credential",
  "list_credentials",
  "delete_credential",
  "set_webhook",
  "start_pair_debug",
  "get_pair_debug_context",
  "stop_pair_debug",
];

export { TestSummarySchema, TestDetailSchema, RunTriggerSchema };
