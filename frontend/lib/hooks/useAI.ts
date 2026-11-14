"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { api, ApiRequestError } from "@/lib/api/client";
import * as courseRepo from "@/lib/db/repositories/courseRepo";
import { cachePages, pagesForCourse } from "@/lib/offline/serviceWorker";
import type { AIGeneratedCourse, DownloadedCourse, GenerateCourseRequest, GenerateQuizRequest, LearningPathRequest, TutorMessage, TutorRequest } from "@/lib/types";
import { useOnlineStatus } from "./useOnlineStatus";
import { LOCAL, queryKeys } from "./queryKeys";

const OFFLINE_MESSAGE = "Nova needs internet for this. Your downloaded courses still work offline!";

function offlineError(): ApiRequestError {
  return new ApiRequestError(0, "OFFLINE", OFFLINE_MESSAGE);
}

/**
 * mutate({ topic }) → { generated: AIGeneratedCourse, saved: DownloadedCourse | null }.
 * By default the course is saved to the device immediately, so it can be opened offline like any other course.
 */
export function useGenerateCourse(options: { autoSave?: boolean } = {}) {
  const autoSave = options.autoSave ?? true;
  const qc = useQueryClient();
  const { isReachable } = useOnlineStatus();
  const mutation = useMutation({
    mutationFn: async (req: GenerateCourseRequest): Promise<{ generated: AIGeneratedCourse; saved: DownloadedCourse | null }> => {
      if (!isReachable) throw offlineError();
      const generated = await api.generateCourse(req);
      const saved = autoSave ? await courseRepo.saveAICourse(generated.course, { prompt: generated.prompt, model: generated.model }) : null;
      if (saved) void cachePages(pagesForCourse(saved.course));
      return { generated, saved };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.downloaded });
      void qc.invalidateQueries({ queryKey: queryKeys.aiCourses });
    },
  });
  return { ...mutation, isOffline: !isReachable };
}

/** Save a generated course later (when using autoSave: false). */
export function useSaveAICourse() {
  const qc = useQueryClient();
  return useMutation({
    ...LOCAL,
    mutationFn: (g: AIGeneratedCourse) => courseRepo.saveAICourse(g.course, { prompt: g.prompt, model: g.model }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.downloaded });
      void qc.invalidateQueries({ queryKey: queryKeys.aiCourses });
    },
  });
}

export function useAICourses() {
  return useQuery({ queryKey: queryKeys.aiCourses, ...LOCAL, queryFn: () => courseRepo.getAICourses() });
}

export function useGenerateQuiz() {
  const { isReachable } = useOnlineStatus();
  const m = useMutation({ mutationFn: (req: GenerateQuizRequest) => (isReachable ? api.generateQuiz(req) : Promise.reject(offlineError())) });
  return { ...m, isOffline: !isReachable };
}

export function useLearningPath() {
  const { isReachable } = useOnlineStatus();
  const m = useMutation({ mutationFn: (req: LearningPathRequest) => (isReachable ? api.learningPath(req) : Promise.reject(offlineError())) });
  return { ...m, isOffline: !isReachable };
}

export interface TutorChatMessage extends TutorMessage {
  id: string;
  /** Nova's suggested follow-up question, if any. */
  followUpQuestion?: string;
  redirected?: boolean;
}

/**
 * Nova chat. Keeps the conversation, sends the last 10 turns as history, and exposes `isOffline`
 * instead of throwing a network error when there's no connection.
 *
 * const { messages, ask, isThinking, isOffline, error, reset } = useTutor({ lessonTitle: "Variables" });
 */
export function useTutor(context?: TutorRequest["context"]) {
  const { isReachable } = useOnlineStatus();
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const mutation = useMutation({ mutationFn: (req: TutorRequest) => api.tutor(req) });

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim().slice(0, 500);
      if (!text || !isReachable) return null;
      const history = messages.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 1000) }));
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "student", text }]);
      try {
        const res = await mutation.mutateAsync({ question: text, history, context });
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: "nova", text: res.answer, followUpQuestion: res.followUpQuestion, redirected: res.redirected },
        ]);
        return res;
      } catch {
        return null; // error is exposed via `error`
      }
    },
    [context, isReachable, messages, mutation],
  );

  return {
    messages,
    ask,
    isThinking: mutation.isPending,
    isOffline: !isReachable,
    offlineMessage: OFFLINE_MESSAGE,
    error: mutation.error as ApiRequestError | null,
    reset: () => {
      setMessages([]);
      mutation.reset();
    },
  };
}
