import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.ts";

const ALGO = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const BLOB_VERSION = 1;

let cachedKey: Buffer | null = null;

/**
 * One machine-local key for the whole install (not per-project): the
 * per-project trust boundary is the SQLite file itself, so a per-credential
 * or per-project key would add rotation complexity without a corresponding
 * security gain. Losing this file makes all stored secrets unrecoverable by
 * design — that's an onboarding callout, not a bug to fix here.
 */
export function ensureMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const path = config.masterKeyPath;
  if (existsSync(path)) {
    cachedKey = readFileSync(path);
    if (cachedKey.length !== KEY_LENGTH) {
      throw new Error(`master key at ${path} has unexpected length ${cachedKey.length}`);
    }
    return cachedKey;
  }
  mkdirSync(dirname(path), { recursive: true });
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(path, key, { mode: 0o600 });
  chmodSync(path, 0o600);
  cachedKey = key;
  return key;
}

/** Packs version(1) || iv(12) || tag(16) || ciphertext into one BLOB column. */
export function encryptSecret(plaintext: string): Buffer {
  const key = ensureMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([BLOB_VERSION]), iv, tag, ciphertext]);
}

export function decryptSecret(blob: Buffer): string {
  const version = blob[0];
  if (version !== BLOB_VERSION) throw new Error(`unsupported secret blob version ${version}`);
  const iv = blob.subarray(1, 1 + IV_LENGTH);
  const tag = blob.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const key = ensureMasterKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
