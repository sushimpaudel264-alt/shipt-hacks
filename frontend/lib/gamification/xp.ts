import type { Lesson, Question, Quiz, QuizAnswer } from "@/lib/types";

/** Quiz bonus is worth up to 50% of the lesson's base XP, scaled by score. */
const QUIZ_BONUS_RATIO = 0.5;
const XP_PER_LEVEL = 100;

const clampScore = (score: number) => Math.max(0, Math.min(100, score));

export function quizBonusXP(lesson: Pick<Lesson, "xpReward">, quizScore: number | null): number {
  if (quizScore === null) return 0;
  return Math.round(lesson.xpReward * QUIZ_BONUS_RATIO * (clampScore(quizScore) / 100));
}

/** Total XP a lesson is worth: base reward plus a quiz-performance bonus. */
export function calculateLessonXP(lesson: Pick<Lesson, "xpReward">, quizScore: number | null): number {
  return lesson.xpReward + quizBonusXP(lesson, quizScore);
}

export function getLevel(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  const safe = Math.max(0, Math.floor(xp));
  return {
    level: Math.floor(safe / XP_PER_LEVEL) + 1,
    xpIntoLevel: safe % XP_PER_LEVEL,
    xpForNextLevel: XP_PER_LEVEL,
  };
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function isAnswerCorrect(question: Question, answer: string): boolean {
  const given = normalize(answer);
  if (given === "") return false;
  const accepted = [question.correctAnswer, ...(question.acceptableAnswers ?? [])].map(normalize);
  return accepted.includes(given);
}

export interface QuizScore {
  answers: (QuizAnswer & { correct: boolean })[];
  correctCount: number;
  totalQuestions: number;
  /** 0-100, rounded to a whole number. */
  score: number;
  passed: boolean;
}

/** Grades a quiz entirely offline. Unanswered questions count as wrong. */
export function scoreQuiz(quiz: Quiz, answers: QuizAnswer[]): QuizScore {
  const byId = new Map(answers.map((a) => [a.questionId, a.answer]));
  const graded = quiz.questions.map((q) => {
    const answer = byId.get(q.id) ?? "";
    return { questionId: q.id, answer, correct: isAnswerCorrect(q, answer) };
  });
  const correctCount = graded.filter((g) => g.correct).length;
  const totalQuestions = quiz.questions.length;
  const score = Math.round((correctCount / totalQuestions) * 100);
  return { answers: graded, correctCount, totalQuestions, score, passed: score >= quiz.passingScore };
}
