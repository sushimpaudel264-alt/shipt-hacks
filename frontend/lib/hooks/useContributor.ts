"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contributorApi, type ContributorCourseInput, type ContributorCoursePatch } from "./apiClient";
import type { ContributorRole } from "@/lib/types";
import { queryKeys } from "./queryKeys";

/**
 * Contributor dashboard hooks (mock auth: pass the role to act as, e.g. "teacher").
 * Server rejects "student" and missing roles.
 */
export function useContributorCourses(role: ContributorRole) {
  return useQuery({ queryKey: queryKeys.contributorCourses(role), queryFn: () => contributorApi(role).listCourses() });
}

function useInvalidate(role: ContributorRole) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.contributorCourses(role) });
    void qc.invalidateQueries({ queryKey: ["courses"] });
  };
}

export function useCreateCourse(role: ContributorRole) {
  const onSuccess = useInvalidate(role);
  return useMutation({ mutationFn: (input: ContributorCourseInput) => contributorApi(role).createCourse(input), onSuccess });
}

export function useUpdateContributorCourse(role: ContributorRole) {
  const onSuccess = useInvalidate(role);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContributorCoursePatch }) => contributorApi(role).updateCourse(id, patch),
    onSuccess,
  });
}

/** Publishing validates (>=1 lesson, valid quizzes) and bumps the version. Errors carry `details` per field. */
export function usePublishCourse(role: ContributorRole) {
  const onSuccess = useInvalidate(role);
  return useMutation({ mutationFn: (id: string) => contributorApi(role).publishCourse(id), onSuccess });
}

export function useDeleteDraft(role: ContributorRole) {
  const onSuccess = useInvalidate(role);
  return useMutation({ mutationFn: (id: string) => contributorApi(role).deleteCourse(id), onSuccess });
}
