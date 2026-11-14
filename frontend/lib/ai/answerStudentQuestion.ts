import "server-only";
import { TutorResponseSchema } from "@/lib/schemas";
import type { TutorRequest, TutorResponse } from "@/lib/types";
import { generateValidated, getAIConfig, mockDelay, type Validation } from "./gemini";
import { mockTutor } from "./mock";
import { NOVA_PERSONA, tutorPrompt } from "./prompts";
import { DraftTutorSchema, issuesOf, toGeminiSchema } from "./schemas";

const MAX_WORDS = 150;

/** Backstop for the prompt's "under 150 words" rule; cuts at a sentence boundary when possible. */
export function capWords(text: string, max = MAX_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  const clipped = words.slice(0, max).join(" ");
  const lastStop = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  return lastStop > clipped.length / 2 ? clipped.slice(0, lastStop + 1) : `${clipped}…`;
}

function validate(raw: unknown): Validation<TutorResponse> {
  const d = DraftTutorSchema.safeParse(raw);
  if (!d.success) return { ok: false, issues: issuesOf(d.error) };
  const r = TutorResponseSchema.safeParse({ ...d.data, answer: capWords(d.data.answer) });
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: issuesOf(r.error) };
}

export async function answerStudentQuestion(req: TutorRequest): Promise<TutorResponse> {
  if (getAIConfig().mock) {
    await mockDelay();
    const r = validate(mockTutor(req.question, req.context));
    if (!r.ok) throw new Error(r.issues.join("; "));
    return r.value;
  }
  const { value } = await generateValidated({
    system: NOVA_PERSONA,
    prompt: tutorPrompt(req),
    responseJsonSchema: toGeminiSchema(DraftTutorSchema),
    validate,
    temperature: 0.6,
  });
  return value;
}
