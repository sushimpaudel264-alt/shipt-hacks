import { aiGuard, generateLearningPath, runAI } from "@/lib/ai";
import { LearningPathRequestSchema } from "@/lib/schemas";
import { handle, ok, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** POST /api/ai/learning-path { goal, completedCourseIds?, ageYears? } → LearningPath. Rate limited per IP. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, LearningPathRequestSchema);
  return ok(await runAI(() => generateLearningPath(input)));
});
