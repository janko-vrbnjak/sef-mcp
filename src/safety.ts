import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/** Remove anything that looks like a secret before text leaves the process. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[REDACTED]");
  }
  // Defensive: header-shaped leaks
  out = out.replace(/(ApiKey["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]");
  return out;
}

/**
 * Resolve a user-supplied file path and guarantee it stays inside `root`
 * (after following symlinks). Used for attachments so a prompt can never
 * make the server read arbitrary files.
 */
export function resolveInside(root: string, userPath: string): string {
  const realRoot = realpathSync(root);
  const candidate = isAbsolute(userPath) ? userPath : resolve(realRoot, userPath);
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    throw new Error(`File not found: ${userPath}`);
  }
  const rel = relative(realRoot, real);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Access denied: ${userPath} is outside the allowed attachments directory`);
  }
  if (!statSync(real).isFile()) throw new Error(`Not a file: ${userPath}`);
  return real;
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // strip control chars not allowed in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
