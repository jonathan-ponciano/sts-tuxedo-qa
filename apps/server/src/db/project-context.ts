import type { Database } from "bun:sqlite";
import { projectArtifactsDir, projectSpecsDir } from "../config.ts";
import { getProjectDb } from "./project.ts";
import { findProjectById, findProjectBySlug, touchProjectSeen } from "./registry.ts";

/**
 * The ONLY object handlers (MCP tools or REST routes) are allowed to use to
 * reach a project's data. Nothing else should call getProjectDb / registry
 * lookups directly — see the shared handler types that require this as their
 * first argument.
 */
export interface ProjectContext {
  id: number;
  slug: string;
  db: Database;
  specsDir: string;
  artifactsDir: string;
  // Nullable: projects created before auth existed may still be unowned
  // until adopted (see auth/signup.ts's adoptOrphanedProjects). Anything that
  // needs the owning account (e.g. the chat agent resolving which LLM key to
  // bill) must handle null explicitly rather than assume it's always set.
  accountId: number | null;
}

export class ProjectNotFoundError extends Error {
  constructor(slug: string) {
    super(`project not found: ${slug}`);
    this.name = "ProjectNotFoundError";
  }
}

export function resolveProject(slug: string): ProjectContext {
  const row = findProjectBySlug(slug);
  if (!row) throw new ProjectNotFoundError(slug);
  touchProjectSeen(row.id);
  return {
    id: row.id,
    slug: row.slug,
    db: getProjectDb(row.id, row.slug),
    specsDir: projectSpecsDir(row.slug),
    artifactsDir: projectArtifactsDir(row.slug),
    accountId: row.account_id,
  };
}

/**
 * The auth-checked equivalent of `resolveProject`, for REST dashboard traffic
 * only — `resolveProject` itself stays unscoped because the MCP route and the
 * scheduler both need to reach any project regardless of which browser
 * session is (or isn't) attached. Throwing the same `ProjectNotFoundError`
 * for "doesn't exist" and "exists but isn't yours" is deliberate: a 404
 * doesn't confirm another account's project slug exists.
 */
export function resolveProjectForAccount(slug: string, accountId: number): ProjectContext {
  const row = findProjectBySlug(slug);
  if (!row || row.account_id !== accountId) throw new ProjectNotFoundError(slug);
  touchProjectSeen(row.id);
  return {
    id: row.id,
    slug: row.slug,
    db: getProjectDb(row.id, row.slug),
    specsDir: projectSpecsDir(row.slug),
    artifactsDir: projectArtifactsDir(row.slug),
    accountId: row.account_id,
  };
}

/** For the handful of callers that only have a numeric project id (e.g. the public status-page lookup, keyed by its own slug namespace). */
export function resolveProjectById(id: number): ProjectContext {
  const row = findProjectById(id);
  if (!row) throw new ProjectNotFoundError(`#${id}`);
  touchProjectSeen(row.id);
  return {
    id: row.id,
    slug: row.slug,
    db: getProjectDb(row.id, row.slug),
    specsDir: projectSpecsDir(row.slug),
    artifactsDir: projectArtifactsDir(row.slug),
    accountId: row.account_id,
  };
}
