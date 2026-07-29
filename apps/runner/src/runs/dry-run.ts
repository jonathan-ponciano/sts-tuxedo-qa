import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DryRunRequest, DryRunResponse } from "@tuxedo-qa/shared";
import { projectSpecsDir } from "../config.ts";
import { assertSafeSlug } from "../paths.ts";
import { ensureNodeModulesLink, runPlaywrightTest } from "../playwright/cli.ts";
import { withProtectionConfig } from "../playwright/protection-config.ts";

/** Blocking: `create_test` awaits this directly, no progress streaming needed for a single provisional run. */
export async function dryRunTest(req: DryRunRequest): Promise<DryRunResponse> {
  assertSafeSlug(req.projectSlug);
  const specsDir = projectSpecsDir(req.projectSlug);
  const projectDir = dirname(specsDir);
  mkdirSync(specsDir, { recursive: true });
  ensureNodeModulesLink(projectDir);

  const tmpFile = `.dry-run-${randomUUID()}.spec.ts`;
  const tmpPath = join(specsDir, tmpFile);
  writeFileSync(tmpPath, req.specSource, "utf8");

  const { configArgs, cleanup } = withProtectionConfig(projectDir, req.protectionHeaders);

  try {
    const { exitCode, stdout, stderr } = await runPlaywrightTest([...configArgs, `specs/${tmpFile}`, "--reporter=line"], projectDir);
    const executedOk = exitCode === 0;
    return {
      valid: true,
      executedOk,
      errors: executedOk ? undefined : [stderr.trim() || stdout.trim()].filter(Boolean),
    };
  } catch (err) {
    return { valid: false, executedOk: false, errors: [(err as Error).message] };
  } finally {
    rmSync(tmpPath, { force: true });
    cleanup();
  }
}
