import { IdParamsSchema } from "@/lib/schemas";
import { handle, ok, publishCourse, readParams, requireContributor, type IdContext } from "@/lib/server";

export const dynamic = "force-dynamic";

/** POST /api/contributor/courses/:id/publish → Course (validated, version + 1). 422 with details if not ready. */
export const POST = handle(async (req: Request, ctx: IdContext) => {
  const contributor = requireContributor(req);
  const { id } = await readParams(ctx, IdParamsSchema);
  return ok(publishCourse(contributor, id));
});
