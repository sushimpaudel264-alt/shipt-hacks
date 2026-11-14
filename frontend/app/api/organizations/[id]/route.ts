import { getOrganization } from "@/lib/server/courses";
import { handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/organizations/:id → { organization, courses: CourseSummary[] } */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return ok(getOrganization(id));
});
