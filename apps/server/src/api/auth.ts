import { Hono } from "hono";
import { z } from "zod";
import { clearSession, currentUser, issueSession } from "../auth/session.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import {
  addAccountMember,
  adoptOrphanedProjects,
  countAccounts,
  createAccount,
  createUser,
  findAccountsForUser,
  findUserByEmail,
} from "../db/registry.ts";

export const authRoute = new Hono();

function randomSlugSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

function publicUser(user: { id: number; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

const signupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

authRoute.post("/signup", async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { email, name, password } = parsed.data;

  if (findUserByEmail(email)) return c.json({ error: "email_taken" }, 409);

  const passwordHash = await hashPassword(password);
  const user = createUser(email, name, passwordHash);

  const isFirstAccountEver = countAccounts() === 0;
  const account = createAccount(`${name}'s account`, `acc-${randomSlugSuffix()}`);
  addAccountMember(account.id, user.id, "owner");
  // Local installs from before auth existed have orphaned projects (account_id
  // IS NULL) — the very first account on this instance adopts them so
  // upgrading in place doesn't strand existing work.
  if (isFirstAccountEver) adoptOrphanedProjects(account.id);

  issueSession(c, user.id);
  return c.json({ user: publicUser(user), account }, 201);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoute.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { email, password } = parsed.data;

  const user = findUserByEmail(email);
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  issueSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

authRoute.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

authRoute.get("/me", (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ user: null }, 401);
  const accounts = findAccountsForUser(user.id);
  return c.json({ user: publicUser(user), accounts });
});
