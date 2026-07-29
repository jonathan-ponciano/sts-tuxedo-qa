import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RunRequest, RunTarget } from "@tuxedo-qa/shared";
import { projectSpecsDir } from "../config.ts";
import { assertSafeFileName, assertSafeSlug } from "../paths.ts";
import { ensureNodeModulesLink, runPlaywrightTest } from "../playwright/cli.ts";
import { withProtectionConfig } from "../playwright/protection-config.ts";
import { emit, scheduleCleanup } from "./events.ts";

function listAllSpecs(specsDir: string): RunTarget[] {
  return readdirSync(specsDir)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((fileName) => ({ testId: -1, fileName }));
}

/** Fire-and-forget from the HTTP handler — progress goes out via the events hub, not the return value. */
export async function executeRun(req: RunRequest): Promise<void> {
  assertSafeSlug(req.projectSlug);
  const specsDir = projectSpecsDir(req.projectSlug);
  ensureNodeModulesLink(dirname(specsDir));

  let targets: RunTarget[];
  try {
    targets = req.targets ?? listAllSpecs(specsDir);
  } catch (err) {
    emit(req.runId, { kind: "log", runId: req.runId, line: `failed to list specs: ${(err as Error).message}`, ts: Date.now() });
    emit(req.runId, { kind: "status", runId: req.runId, status: "error", ts: Date.now() });
    scheduleCleanup(req.runId);
    return;
  }

  if (targets.length === 0) {
    emit(req.runId, { kind: "status", runId: req.runId, status: "passed", ts: Date.now() });
    scheduleCleanup(req.runId);
    return;
  }

  const projectDir = dirname(specsDir);
  const { configArgs, cleanup } = withProtectionConfig(projectDir, req.protectionHeaders);

  let anyFailed = false;
  try {
    for (const target of targets) {
      try {
        assertSafeFileName(target.fileName);
      } catch (err) {
        emit(req.runId, { kind: "log", runId: req.runId, line: (err as Error).message, ts: Date.now() });
        anyFailed = true;
        continue;
      }

      emit(req.runId, { kind: "step", runId: req.runId, testName: target.fileName, step: "starting", ts: Date.now() });

      const env: Record<string, string> = { ...req.env };
      if (req.headed) env.PWHEADED = "1";

      const { exitCode, stdout, stderr } = await runPlaywrightTest(
        [...configArgs, `specs/${target.fileName}`, req.headed ? "--headed" : "", "--reporter=line"].filter(Boolean),
        projectDir,
        env,
      );

      for (const line of stdout.split("\n").filter(Boolean)) {
        emit(req.runId, { kind: "log", runId: req.runId, line, ts: Date.now() });
      }
      if (stderr.trim()) {
        emit(req.runId, { kind: "log", runId: req.runId, line: stderr.trim(), ts: Date.now() });
      }

      emit(req.runId, {
        kind: "step",
        runId: req.runId,
        testName: target.fileName,
        step: exitCode === 0 ? "passed" : "failed",
        ts: Date.now(),
      });
      if (exitCode !== 0) anyFailed = true;
    }
  } finally {
    cleanup();
  }

  emit(req.runId, { kind: "status", runId: req.runId, status: anyFailed ? "failed" : "passed", ts: Date.now() });
  scheduleCleanup(req.runId);
}
