import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toolSchemas, type ToolName } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import { HANDLERS } from "./handler-registry.ts";

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
