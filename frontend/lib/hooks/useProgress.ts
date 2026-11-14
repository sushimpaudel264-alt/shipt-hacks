"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { progressRepo } from "@/lib/db";
import { notifyLocalChange } from "@/lib/sync";
import type { LearningOutcome, Progress, QuizAnswer } from "@/lib/types";
import { LOCAL, queryKeys } from "./queryKeys";

/** Progress rows for one course (or all courses when courseId is omitted). Local-only, offline-safe. */
export function useProgress(courseId?: string) {
  return useQuery({
    queryKey: queryKeys.progress(courseId),
    ...LOCAL,
    queryFn: (): Promise<Progress[]> => (courseId ? progressRepo.getCourseProgress(courseId) : progressRepo.getAllProgress()),
  });
}

export function useQuizResults(lessonId?: string) {
  return useQuery({ queryKey: queryKeys.quizResults(lessonId), ...LOCAL, queryFn: () => progressRepo.getQuizResults(lessonId) });
}

function useAfterLearning() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["progress"] });
    void qc.invalidateQueries({ queryKey: ["quizResults"] });
    void qc.invalidateQueries({ queryKey: queryKeys.student });
    void qc.invalidateQueries({ queryKey: queryKeys.syncQueue });
    void notifyLocalChange();
  };
}

/** Call when a lesson is opened: marks it in-progress (never downgrades a completed lesson). */
export function useStartLesson() {
  const qc = useQueryClient();
  return useMutation({
    ...LOCAL,
    mutationFn: ({ courseId, lessonId }: { courseId: string; lessonId: string }) => progressRepo.startLesson(courseId, lessonId),
    onSuccess: (p) => void qc.invalidateQueries({ queryKey: queryKeys.progress(p.courseId) }),
  });
}

/**
 * mutate({ courseId, lessonId }) → LearningOutcome { xpAwarded, totalXp, newBadges, streak, streakIncreased, progress }.
 * Works offline. Use newBadges / streakIncreased to trigger celebrations.
 */
export function useCompleteLesson() {
  const after = useAfterLearning();
  return useMutation<LearningOutcome, Error, { courseId: string; lessonId: string }>({
    ...LOCAL,
    mutationFn: (input) => progressRepo.completeLesson(input),
    onSuccess: after,
  });
}

/**
 * mutate({ courseId, lessonId, answers: [{ questionId, answer }] }) → LearningOutcome with quizResult
 * (score 0-100, per-question correct flags). Graded offline; also completes the lesson.
 */
export function useSubmitQuiz() {
  const after = useAfterLearning();
  return useMutation<LearningOutcome, Error, { courseId: string; lessonId: string; answers: QuizAnswer[] }>({
    ...LOCAL,
    mutationFn: (input) => progressRepo.submitQuiz(input),
    onSuccess: after,
  });
}
