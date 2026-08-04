import type { MiddlewareHandler } from "hono";
import { currentUser } from "../auth/session.ts";
import { findAccountsForUser, type AccountRow, type UserRow } from "../db/registry.ts";
import type { ProjectContext } from "../db/project-context.ts";
import { ProjectNotFoundError, resolveProjectForAccount } from "../db/project-context.ts";

declare module "hono" {
  interface ContextVariableMap {
    project: ProjectContext;
    user: UserRow;
    account: AccountRow;
  }
}

/**
 * Resolves the session cookie into a user + their primary (first-joined)
 * account. v1 has no account switcher, so "primary account" is just
 * "the first one this user is a member of" — every user has exactly one
 * today since signup creates one automatically.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  const [account] = findAccountsForUser(user.id);
  if (!account) return c.json({ error: "no_account" }, 403);
  c.set("user", user);
  c.set("account", account);
  await next();
};

/** REST equivalent of the MCP route's resolver — the only other place allowed to call resolveProjectForAccount. Must run after authMiddleware. */
export const projectMiddleware: MiddlewareHandler = async (c, next) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "missing_project_slug" }, 400);
  try {
    c.set("project", resolveProjectForAccount(slug, c.get("account").id));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) return c.json({ error: "project_not_found", slug }, 404);
    throw err;
  }
  await next();
};
