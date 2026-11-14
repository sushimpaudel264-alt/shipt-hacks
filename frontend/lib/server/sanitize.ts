import "server-only";

/**
 * Contributor content is rendered as plain text (no HTML), so the safest sanitizer is to strip
 * all markup rather than allow-list tags. Also neutralises javascript:/data: URLs and control chars.
 */
function sanitizeText(input: string): string {
  return input
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(javascript|vbscript|data)\s*:/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

/** Recursively sanitizes every string in a JSON-like value. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeDeep(v)])) as T;
  }
  return value;
}
