/** Thin wrapper over Bun's built-in password hashing (argon2id by default) — no extra dependency needed. */

export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}
