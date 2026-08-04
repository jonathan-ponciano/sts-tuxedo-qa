import { zodToJsonSchema } from "zod-to-json-schema";
import { IMPLEMENTED_TOOLS, toolSchemas, type ToolName } from "@tuxedo-qa/shared";
import type { ProjectContext } from "../db/project-context.ts";
import { HANDLERS } from "../mcp/handler-registry.ts";
import type { ProviderToolDef } from "./providers/types.ts";

/**
 * Same 19 tools an external MCP client gets, converted to a provider-agnostic
 * {name, description, inputSchema} shape — each provider adapter
 * (anthropic-provider.ts, gemini-provider.ts, ...) maps this to its own
 * wire format. `packages/shared/src/mcp-schemas/tools.ts` stays the one
 * place a tool's contract is defined, whether the caller is an external MCP
 * client or this embedded agent.
 */
export function buildToolDefs(names: ToolName[] = IMPLEMENTED_TOOLS): ProviderToolDef[] {
  return names.map((name) => {
    const def = toolSchemas[name];
    const schema = zodToJsonSchema(def.input) as Record<string, unknown>;
    delete schema.$schema;
    return { name, description: def.description, inputSchema: schema };
  });
}

export interface ToolCallResult {
  ok: boolean;
  output: unknown;
}

/** Runs one tool call the model asked for, the same way the MCP transport would — same handler, same ProjectContext. */
export async function runTool(ctx: ProjectContext, name: string, input: unknown): Promise<ToolCallResult> {
  const handler = HANDLERS[name as ToolName];
  if (!handler) return { ok: false, output: `"${name}" is registered but not implemented yet in this build.` };
  try {
    const output = await handler(ctx, input);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}
