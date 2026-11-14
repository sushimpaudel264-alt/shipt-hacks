import { IdParamsSchema } from "@/lib/schemas";
import { getPublishedCourse, handle, ok, readParams, type IdContext } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/courses/:id → Course (published only). */
export const GET = handle(async (_req: Request, ctx: IdContext) => {
  const { id } = await readParams(ctx, IdParamsSchema);
  return ok(getPublishedCourse(id));
});
