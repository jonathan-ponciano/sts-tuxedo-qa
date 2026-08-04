import type { ToolName } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import * as handlers from "./handlers.ts";

export type AnyHandler = (ctx: ProjectContext, input: unknown) => unknown | Promise<unknown>;

/**
 * Single source of truth for tool name -> handler, shared by the MCP
 * transport (register.ts) and the embedded chat agent (agent/tool-adapter.ts)
 * — both need to call the exact same functions, so this map exists exactly
 * once. Only the tools listed in `IMPLEMENTED_TOOLS` (packages/shared) have a
 * real handler here; everything else is a deliberate gap for either caller
 * to handle as "not implemented yet".
 */
export const HANDLERS: Partial<Record<ToolName, AnyHandler>> = {
  inspect_page: handlers.inspectPage as AnyHandler,
  create_test: handlers.createTest as AnyHandler,
  list_tests: handlers.listTests as AnyHandler,
  read_test: handlers.readTest as AnyHandler,
  update_test: handlers.updateTest as AnyHandler,
  delete_test: handlers.deleteTest as AnyHandler,
  run_tests: handlers.runTests as AnyHandler,
  run_until_pass: handlers.runUntilPass as AnyHandler,
  pause_tests: handlers.pauseTests as AnyHandler,
  get_status: handlers.getStatus as AnyHandler,
  request_credential: handlers.requestCredential as AnyHandler,
  create_credential: handlers.createCredential as AnyHandler,
  list_credentials: ((ctx: ProjectContext) => handlers.listCredentials(ctx)) as AnyHandler,
  delete_credential: handlers.deleteCredential as AnyHandler,
  set_webhook: handlers.setWebhook as AnyHandler,
  start_pair_debug: handlers.startPairDebug as AnyHandler,
  step_pair_debug: handlers.stepPairDebug as AnyHandler,
  get_pair_debug_context: handlers.getPairDebugContext as AnyHandler,
  stop_pair_debug: handlers.stopPairDebug as AnyHandler,
};
