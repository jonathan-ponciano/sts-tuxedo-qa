import { decryptSecret } from "../crypto/index.ts";
import type { ProjectContext } from "../db/project-context.ts";

interface HeaderRow {
  header_name: string;
  secret_blob: Uint8Array;
}

/**
 * The one place that decrypts protection headers for actual use (inspect_page,
 * dry-run, and real test execution all call this) — the values never leave
 * this process, only get forwarded to the runner over the internal network.
 */
export function getEnabledProtectionHeaders(ctx: ProjectContext): Record<string, string> {
  const rows = ctx.db.query("SELECT header_name, secret_blob FROM protection_headers WHERE enabled = 1").all() as HeaderRow[];
  const headers: Record<string, string> = {};
  for (const row of rows) {
    headers[row.header_name] = decryptSecret(Buffer.from(row.secret_blob));
  }
  return headers;
}
