import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const RUNNER_ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const RUNNER_NODE_MODULES = join(RUNNER_ROOT, "node_modules");
const PLAYWRIGHT_CLI = join(RUNNER_NODE_MODULES, "@playwright", "test", "cli.js");

/**
 * Spec files live on the shared `./data` volume, outside this app's own
 * package tree, so plain Node module resolution for `import { test } from
 * "@playwright/test"` inside a spec file would fail to find node_modules by
 * walking up from the spec's own path. Symlinking one into the project
 * directory (once, lazily) fixes that without duplicating the dependency
 * per project.
 */
export function ensureNodeModulesLink(projectDir: string): void {
  mkdirSync(projectDir, { recursive: true });
  const target = join(projectDir, "node_modules");
  if (existsSync(target)) return;
  try {
    symlinkSync(RUNNER_NODE_MODULES, target, "dir");
  } catch {
    // benign race: another request created it first
  }
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runPlaywrightTest(args: string[], cwd: string, env?: Record<string, string>): Promise<CliResult> {
  const proc = Bun.spawn({
    cmd: ["node", PLAYWRIGHT_CLI, "test", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env, CI: "1" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
