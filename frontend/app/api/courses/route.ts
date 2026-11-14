import { CourseListQuerySchema } from "@/lib/schemas";
import { listPublishedCourses } from "@/lib/server/courses";
import { handle, ok, parseWith } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/courses?category=&difficulty=&q= → CourseSummary[] (no lesson bodies). */
export const GET = handle(async (req: Request) => {
  const params = Object.fromEntries(
    [...new URL(req.url).searchParams].filter(([, v]) => v !== ""),
  );
  const query = parseWith(CourseListQuerySchema, params);
  return ok(listPublishedCourses(query));
});
