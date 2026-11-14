"use client";
/**
 * Course hooks. Rule of thumb: anything the student can open offline is read from Dexie FIRST;
 * the network is only used for browsing the catalog, downloading and updating.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";
import { courseRepo } from "@/lib/db";
import { cacheCoursePages, notifyLocalChange } from "@/lib/sync";
import type { Course, CourseListQuery, CourseSummary, DownloadedCourse } from "@/lib/types";
import { LOCAL, queryKeys } from "./queryKeys";

export interface CourseCatalog {
  courses: CourseSummary[];
  /** "offline-downloads" when the network failed and we fell back to what's on this device. */
  source: "network" | "offline-downloads";
}

function summarize(c: Course): CourseSummary {
  const { lessons, ...rest } = c;
  return { ...rest, lessonCount: lessons.length, lessonTitles: lessons.map((l) => l.title) };
}

/** Catalog of published courses. Offline it falls back to downloaded courses instead of erroring. */
export function useCourses(query: CourseListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.courses(query),
    ...LOCAL,
    retry: false,
    queryFn: async (): Promise<CourseCatalog> => {
      try {
        return { courses: await api.listCourses(query), source: "network" };
      } catch {
        const local = (await courseRepo.getDownloaded()).map((d) => summarize(d.course));
        const q = query.q?.toLowerCase();
        return {
          source: "offline-downloads",
          courses: local.filter(
            (c) =>
              (!query.category || c.category === query.category) &&
              (!query.difficulty || c.difficulty === query.difficulty) &&
              (!q || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
          ),
        };
      }
    },
  });
}

export interface CourseDetail {
  course: Course;
  /** True when the full course is stored on this device (works offline). */
  isDownloaded: boolean;
}

/** A single course: from Dexie if downloaded (offline-safe), otherwise from the API. null = not found. */
export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.course(id ?? ""),
    enabled: !!id,
    ...LOCAL,
    retry: false,
    queryFn: async (): Promise<CourseDetail | null> => {
      const local = await courseRepo.getCourse(id!);
      if (local) return { course: local, isDownloaded: true };
      try {
        return { course: await api.getCourse(id!), isDownloaded: false };
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },
  });
}

export function useDownloadedCourses() {
  return useQuery({ queryKey: queryKeys.downloaded, ...LOCAL, queryFn: (): Promise<DownloadedCourse[]> => courseRepo.getDownloaded() });
}

function useInvalidateCourse() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.downloaded });
    void qc.invalidateQueries({ queryKey: queryKeys.course(id) });
    void qc.invalidateQueries({ queryKey: queryKeys.courseUpdates });
    void qc.invalidateQueries({ queryKey: queryKeys.storage });
    void qc.invalidateQueries({ queryKey: queryKeys.aiCourses });
  };
}

/** mutate(courseId) → downloads the full package into IndexedDB. */
export function useDownloadCourse() {
  const invalidate = useInvalidateCourse();
  return useMutation({
    mutationFn: (courseId: string) => courseRepo.downloadCourse(courseId),
    onSuccess: (row) => {
      invalidate(row.id);
      void notifyLocalChange();
      // Cache the course's pages now so they open offline even if never visited.
      void cacheCoursePages(row.course);
    },
  });
}

/** mutate(courseId) → removes course content from the device (progress/XP are kept). */
export function useDeleteCourse() {
  const invalidate = useInvalidateCourse();
  return useMutation({
    ...LOCAL,
    mutationFn: async (courseId: string) => {
      await courseRepo.deleteCourse(courseId);
      return courseId;
    },
    onSuccess: invalidate,
  });
}

/** Downloaded courses with a newer version on the server. Only checks while online. */
export function useCourseUpdates() {
  return useQuery({
    queryKey: queryKeys.courseUpdates,
    queryFn: () => courseRepo.checkForUpdates(),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** mutate(courseId) → re-downloads the latest version; progress carries over. */
export function useUpdateCourse() {
  const invalidate = useInvalidateCourse();
  return useMutation({
    mutationFn: (courseId: string) => courseRepo.updateCourse(courseId),
    onSuccess: (row) => invalidate(row.id),
  });
}

export function useOrganizations() {
  return useQuery({ queryKey: queryKeys.organizations, queryFn: () => api.listOrganizations() });
}

export function useOrganization(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.organization(id ?? ""), enabled: !!id, queryFn: () => api.getOrganization(id!) });
}
