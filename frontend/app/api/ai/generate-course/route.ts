import { aiGuard, generateCourse, runAI } from "@/lib/ai";
import { GenerateCourseRequestSchema } from "@/lib/schemas";
import { handle, ok, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** POST /api/ai/generate-course { topic } → AIGeneratedCourse (save locally via useGenerateCourse). Rate limited per IP. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, GenerateCourseRequestSchema);
  return ok(await runAI(() => generateCourse(input)));
});
