import { generateLearningPath } from "@/lib/ai";
import { LearningPathRequestSchema } from "@/lib/schemas";
import { aiGuard, runAI } from "@/lib/server/aiRoute";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { goal, completedCourseIds?, ageYears? } → LearningPath. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, LearningPathRequestSchema);
  return ok(await runAI(() => generateLearningPath(input)));
});
