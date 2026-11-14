import { CourseListQuerySchema } from "@/lib/schemas";
import { handle, listPublishedCourses, ok, readQuery } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/courses?category=&difficulty=&q= → CourseSummary[] (published only, no lesson bodies). */
export const GET = handle(async (req: Request) => {
  const query = readQuery(req, CourseListQuerySchema);
  return ok(listPublishedCourses(query));
});
