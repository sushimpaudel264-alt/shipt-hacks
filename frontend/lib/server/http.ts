import "server-only";
/**
 * The one pattern every API route follows:
 *
 *   export const dynamic = "force-dynamic";
 *   export const GET = handle(async (req: Request, ctx: IdContext) => {
 *     const { id } = await readParams(ctx, IdParamsSchema);   // or readQuery / readJson
 *     return ok(serviceCall(id));
 *   });
 *
 * - Input is validated with a schema from "@/lib/schemas"; failures → 400 VALIDATION_ERROR.
 * - Business logic throws HttpError; `handle` turns it into { error: { code, message, details? } }.
 * - Anything unexpected → 500 INTERNAL_ERROR (logged server-side, never leaks internals or secrets).
 * - All responses are `Cache-Control: no-store` (offline caching is IndexedDB's job, not HTTP's).
 */
import type { z } from "zod";

const NO_STORE = { "Cache-Control": "no-store" };

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

/** Route context for dynamic `[id]` segments. */
export type IdContext = { params: Promise<{ id: string }> };

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

function errorResponse(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status, headers: NO_STORE });
}

/** Converts a ZodError into a compact, client-friendly list. */
export function zodDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
}

function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", "Invalid request", zodDetails(result.error));
  return result.data;
}

/** Validates a JSON request body. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  return parseWith(schema, body);
}

/** Validates the query string (empty values are treated as absent). */
export function readQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  return parseWith(schema, params);
}

/** Validates dynamic route params. */
export async function readParams<S extends z.ZodType>(ctx: { params: Promise<unknown> }, schema: S): Promise<z.infer<S>> {
  return parseWith(schema, await ctx.params);
}

/** Wraps a route handler with the standard error shape. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.code, err.message, err.status, err.details);
      console.error("[api] unhandled error", err);
      return errorResponse("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
