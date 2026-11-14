import { IdParamsSchema } from "@/lib/schemas";
import { getCoursePackage, handle, ok, readParams, type IdContext } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/courses/:id/package → CoursePackage { course, version, sizeBytes, packagedAt } for offline storage. */
export const GET = handle(async (_req: Request, ctx: IdContext) => {
  const { id } = await readParams(ctx, IdParamsSchema);
  return ok(getCoursePackage(id));
});
