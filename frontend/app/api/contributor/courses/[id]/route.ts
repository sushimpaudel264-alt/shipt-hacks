import { ContributorCoursePatchSchema, IdParamsSchema } from "@/lib/schemas";
import { deleteCourse, handle, ok, readJson, readParams, requireContributor, updateCourse, type IdContext } from "@/lib/server";

export const dynamic = "force-dynamic";

/** PATCH /api/contributor/courses/:id ContributorCoursePatch → Course. */
export const PATCH = handle(async (req: Request, ctx: IdContext) => {
  const contributor = requireContributor(req);
  const { id } = await readParams(ctx, IdParamsSchema);
  const patch = await readJson(req, ContributorCoursePatchSchema);
  return ok(updateCourse(contributor, id, patch));
});

/** DELETE /api/contributor/courses/:id → { deleted: true, id }. Drafts only (409 otherwise). */
export const DELETE = handle(async (req: Request, ctx: IdContext) => {
  const contributor = requireContributor(req);
  const { id } = await readParams(ctx, IdParamsSchema);
  deleteCourse(contributor, id);
  return ok({ deleted: true, id });
});
