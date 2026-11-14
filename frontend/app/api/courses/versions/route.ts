import { CourseVersionsQuerySchema } from "@/lib/schemas";
import { getCourseVersions, handle, ok, readQuery } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/courses/versions?ids=a,b,c → { id, version }[] (unknown/unpublished ids omitted). */
export const GET = handle(async (req: Request) => {
  const { ids } = readQuery(req, CourseVersionsQuerySchema);
  return ok(getCourseVersions(ids));
});
