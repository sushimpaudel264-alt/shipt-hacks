import { getCoursePackage } from "@/lib/server/courses";
import { handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/courses/:id/package → CoursePackage (everything needed offline). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  // no-store: packages are persisted in IndexedDB, never in the HTTP/SW cache, so versions can't go stale.
  return ok(getCoursePackage(id), 200, { "Cache-Control": "no-store" });
});
