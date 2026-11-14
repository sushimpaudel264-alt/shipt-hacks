import "server-only";
import { HttpError } from "./http";

/**
 * DEMO-ONLY fixed-window rate limiter (~10 AI requests per minute per IP).
 * Not production-grade: memory is per serverless instance, so limits are approximate on Vercel
 * and reset on cold starts. Use a shared store (e.g. Redis/Upstash) for real deployments.
 */
const WINDOW_MS = 60_000;
const LIMIT = 10;
const hits = new Map<string, { windowStart: number; count: number }>();

export function checkRateLimit(key: string, limit = LIMIT, now = Date.now()): void {
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    hits.set(key, { windowStart: now, count: 1 });
    return;
  }
  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    throw new HttpError(429, "RATE_LIMITED", `Too many AI requests. Try again in ${retryAfter}s.`, { retryAfter });
  }
}
