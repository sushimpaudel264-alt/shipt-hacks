import "server-only";
import { AIOutputError } from "@/lib/ai/gemini";
import { clientIp, HttpError } from "./http";
import { checkRateLimit } from "./rateLimit";

/** Per-IP rate limit shared by every AI route (demo-only, see rateLimit.ts). */
export function aiGuard(req: Request): void {
  checkRateLimit(`ai:${clientIp(req)}`);
}

/** Maps AI failures to clear API errors without leaking provider details or keys. */
export async function runAI<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof AIOutputError) {
      throw new HttpError(502, "AI_INVALID_OUTPUT", "Nova had trouble creating that. Please try again or rephrase.", err.issues.slice(0, 5));
    }
    console.error("[ai] provider error", err);
    throw new HttpError(503, "AI_UNAVAILABLE", "The AI service is unavailable right now. Please try again later.");
  }
}
