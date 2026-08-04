import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "../config.ts";
import { createSession, deleteSession, findUserById, findValidSession, type SessionRow, type UserRow } from "../db/registry.ts";

export const SESSION_COOKIE = "tuxedo_session";

export function issueSession(c: Context, userId: number): SessionRow {
  const session = createSession(userId);
  setCookie(c, SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.publicBaseUrl.startsWith("https://"),
    path: "/",
    expires: new Date(session.expires_at),
  });
  return session;
}

export function clearSession(c: Context): void {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Reads the session cookie and resolves the logged-in user, or null if absent/expired/deleted. */
export function currentUser(c: Context): UserRow | null {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const session = findValidSession(token);
  if (!session) return null;
  return findUserById(session.user_id);
}
