import { aiGuard, answerStudentQuestion, runAI } from "@/lib/ai";
import { TutorRequestSchema } from "@/lib/schemas";
import { handle, ok, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/** POST /api/ai/tutor { question, history?, context? } → TutorResponse (Nova). Rate limited per IP. */
export const POST = handle(async (req: Request) => {
  aiGuard(req);
  const input = await readJson(req, TutorRequestSchema);
  return ok(await runAI(() => answerStudentQuestion(input)));
});
