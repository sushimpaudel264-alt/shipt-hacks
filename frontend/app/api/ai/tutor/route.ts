import { answerStudentQuestion } from "@/lib/ai";
import { TutorRequestSchema } from "@/lib/schemas";
import { aiGuard, runAI } from "@/lib/server/aiRoute";
import { handle, ok, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { question, history?, context? } → TutorResponse (Nova). */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, TutorRequestSchema);
  return ok(await runAI(() => answerStudentQuestion(input)));
});
