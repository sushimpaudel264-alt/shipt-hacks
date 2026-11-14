import { ContributorCourseInputSchema } from "@/lib/schemas";
import { createCourse, listContributorCourses, requireContributor } from "@/lib/server/contributor";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const contributor = requireContributor(req);
  return ok({ contributor, courses: listContributorCourses(contributor) });
});

export const POST = handle(async (req: Request) => {
  const contributor = requireContributor(req);
  const input = await readJson(req, ContributorCourseInputSchema);
  return ok(createCourse(contributor, input), 201);
});
