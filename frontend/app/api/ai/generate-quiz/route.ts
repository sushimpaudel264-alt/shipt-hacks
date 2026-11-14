import { generateQuiz } from "@/lib/ai";
import { GenerateQuizRequestSchema } from "@/lib/schemas";
import { aiGuard, runAI } from "@/lib/server/aiRoute";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { topic, lessonContent?, questionCount? } → GeneratedQuiz. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, GenerateQuizRequestSchema);
  return ok(await runAI(() => generateQuiz(input)));
});
