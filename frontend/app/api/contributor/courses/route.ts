import { ContributorCourseInputSchema } from "@/lib/schemas";
import { createCourse, handle, listContributorCourses, ok, readJson, requireContributor } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/contributor/courses → { contributor, courses: Course[] }. Requires x-mock-role (not "student"). */
export const GET = handle(async (req: Request) => {
  const contributor = requireContributor(req);
  return ok({ contributor, courses: listContributorCourses(contributor) });
});

/** POST /api/contributor/courses ContributorCourseInput → 201 Course (draft, sanitized). */
export const POST = handle(async (req: Request) => {
  const contributor = requireContributor(req);
  const input = await readJson(req, ContributorCourseInputSchema);
  return ok(createCourse(contributor, input), 201);
});
