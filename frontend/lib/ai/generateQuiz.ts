import "server-only";
import { GeneratedQuizSchema } from "@/lib/schemas";
import type { GeneratedQuiz, GenerateQuizRequest } from "@/lib/types";
import { generateValidated, getAIConfig, mockDelay, type Validation } from "./gemini";
import { mockQuiz } from "./mock";
import { quizPrompt } from "./prompts";
import { DraftQuizSchema, issuesOf, toGeminiSchema, type DraftQuestion } from "./schemas";

function toQuiz(topic: string, questions: DraftQuestion[]): Validation<GeneratedQuiz> {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const r = GeneratedQuizSchema.safeParse({ topic, questions: questions.map((q, i) => ({ ...q, id: `ai-quiz-${slug}-q${i + 1}` })) });
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: issuesOf(r.error) };
}

export async function generateQuiz(req: GenerateQuizRequest): Promise<GeneratedQuiz> {
  if (getAIConfig().mock) {
    await mockDelay();
    const r = toQuiz(req.topic, mockQuiz(req.topic, req.questionCount ?? 5));
    if (!r.ok) throw new Error(r.issues.join("; "));
    return r.value;
  }
  const { value } = await generateValidated({
    system: "You write clear, fair, kid-friendly quiz questions.",
    prompt: quizPrompt(req),
    responseJsonSchema: toGeminiSchema(DraftQuizSchema),
    validate: (raw) => {
      const d = DraftQuizSchema.safeParse(raw);
      return d.success ? toQuiz(req.topic, d.data.questions) : { ok: false, issues: issuesOf(d.error) };
    },
  });
  return value;
}
