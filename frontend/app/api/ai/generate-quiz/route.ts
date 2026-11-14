import { aiGuard, generateQuiz, runAI } from "@/lib/ai";
import { GenerateQuizRequestSchema } from "@/lib/schemas";
import { handle, ok, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** POST /api/ai/generate-quiz { topic, lessonContent?, questionCount? } → GeneratedQuiz. Rate limited per IP. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, GenerateQuizRequestSchema);
  return ok(await runAI(() => generateQuiz(input)));
});
