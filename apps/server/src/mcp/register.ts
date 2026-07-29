import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toolSchemas, type ToolName } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import * as handlers from "./handlers.ts";

type AnyHandler = (ctx: ProjectContext, input: unknown) => unknown | Promise<unknown>;

/**
 * Only the tools listed in `IMPLEMENTED_TOOLS` (packages/shared) have a real
 * handler here. Everything else in `toolSchemas` is still registered with its
 * full input/output schema below, just wired to `notImplemented` — filling
 * one in later is adding a map entry, not touching the transport/registration
 * plumbing.
 */
const HANDLERS: Partial<Record<ToolName, AnyHandler>> = {
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
  get_pair_debug_context: handlers.getPairDebugContext as AnyHandler,
  stop_pair_debug: handlers.stopPairDebug as AnyHandler,
};

/**
 * Builds a fresh MCP server for a single request, scoped to `ctx`. Stateless
 * on purpose (see webStandardStreamableHttp options: no sessionIdGenerator):
 * caching a long-lived McpServer instance per project would need session
 * affinity across requests, which buys nothing here since every tool
 * handler's real state already lives in the pooled SQLite connection, not in
 * the McpServer object itself. Cheap to construct per request.
 */
export function createMcpServerForProject(ctx: ProjectContext): McpServer {
  const server = new McpServer({ name: "tuxedo-qa", version: "0.1.0" });

  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    const def = toolSchemas[name];
    const handler = HANDLERS[name];

    const register = server.registerTool.bind(server) as (
      name: string,
      config: { title: string; description: string; inputSchema: unknown; outputSchema: unknown },
      cb: (args: unknown) => Promise<CallToolResult>,
    ) => unknown;

    register(
      name,
      { title: name, description: def.description, inputSchema: def.input, outputSchema: def.output },
      async (args: unknown): Promise<CallToolResult> => {
        if (!handler) {
          return {
            isError: true,
            content: [{ type: "text", text: `"${name}" is registered but not implemented yet in this build.` }],
          };
        }
        try {
          const result = await handler(ctx, args);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (err) {
          return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
        }
      },
    );
  }

  return server;
}
