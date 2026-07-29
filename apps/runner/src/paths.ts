const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+\.spec\.ts$/;

/** The runner never accepts absolute paths from `app` — only slugs/filenames, sanitized before touching disk. */
export function assertSafeSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error(`unsafe project slug: ${slug}`);
}

export function assertSafeFileName(name: string): void {
  if (name.includes("..") || name.includes("/") || !SAFE_FILENAME_RE.test(name)) {
    throw new Error(`unsafe spec file name: ${name}`);
  }
}
