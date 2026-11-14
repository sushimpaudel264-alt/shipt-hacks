import "server-only";
import type { z } from "zod";

/** Every error response has the shape { error: { code, message, details? } }. */
export function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

export function ok<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found`);

/** Converts a ZodError into a compact, client-friendly list. */
export function zodDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", "Invalid request", zodDetails(result.error));
  return result.data;
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  return parseWith(schema, body);
}

/**
 * Wraps a route handler so thrown HttpErrors become typed JSON errors and anything
 * unexpected becomes a generic 500 (logged server-side, never leaking internals/secrets).
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return apiError(err.code, err.message, err.status, err.details);
      console.error("[api] unhandled error", err);
      return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
