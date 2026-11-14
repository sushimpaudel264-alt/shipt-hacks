import { ContributorCoursePatchSchema } from "@/lib/schemas";
import { deleteCourse, requireContributor, updateCourse } from "@/lib/server/contributor";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const contributor = requireContributor(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, ContributorCoursePatchSchema);
  return ok(updateCourse(contributor, id, patch));
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const contributor = requireContributor(req);
  const { id } = await ctx.params;
  deleteCourse(contributor, id);
  return ok({ deleted: true, id });
});
