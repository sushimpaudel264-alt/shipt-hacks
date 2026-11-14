import { publishCourse, requireContributor } from "@/lib/server/contributor";
import { handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const contributor = requireContributor(req);
  const { id } = await ctx.params;
  return ok(publishCourse(contributor, id));
});
