import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Extra HTTP headers (protection_headers, e.g. Basic Auth for a staging
 * gate) have to reach the actual browser context, but we run specs via the
 * plain `playwright test` CLI with no config file by default (see cli.ts —
 * avoids Playwright's testDir/config-discovery pitfalls for the common
 * case). When headers ARE present, a temp config with `use.extraHTTPHeaders`
 * is the only way to inject them without rewriting the user's spec file.
 * Written into the project's own dir (same as `cwd` for the CLI call) so
 * Playwright's default testDir resolution still lines up.
 */
export function withProtectionConfig(
  dir: string,
  headers: Record<string, string> | undefined,
): { configArgs: string[]; cleanup: () => void } {
  if (!headers || Object.keys(headers).length === 0) {
    return { configArgs: [], cleanup: () => {} };
  }

  const fileName = `.tuxedo-protection-${randomUUID()}.config.ts`;
  const filePath = join(dir, fileName);
  writeFileSync(filePath, `export default { use: { extraHTTPHeaders: ${JSON.stringify(headers)} } };\n`, "utf8");

  return {
    configArgs: [`--config=${fileName}`],
    cleanup: () => rmSync(filePath, { force: true }),
  };
}
