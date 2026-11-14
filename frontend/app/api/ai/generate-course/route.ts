import { generateCourse } from "@/lib/ai";
import { GenerateCourseRequestSchema } from "@/lib/schemas";
import { aiGuard, runAI } from "@/lib/server/aiRoute";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { topic } → AIGeneratedCourse (Course with source ai-generated; save it locally with courseRepo.saveAICourse). */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, GenerateCourseRequestSchema);
  return ok(await runAI(() => generateCourse(input)));
});
