/**
 * Everything the UI needs for data. Import from "@/lib/hooks".
 * Requires <CodeLingoProvider> (already in app/layout.tsx). See FRONTEND_GUIDE.md.
 */
export { CodeLingoProvider, type CodeLingoProviderProps } from "./CodeLingoProvider";
export * from "./useCourses";
export * from "./useProgress";
export * from "./useStudent";
export * from "./useOnlineStatus";
export * from "./useSyncStatus";
export * from "./useStorageEstimate";
export * from "./useAI";
export * from "./useContributor";
export { ApiRequestError, type ContributorCourseInput, type ContributorCoursePatch } from "./apiClient";
export { queryKeys } from "./queryKeys";
