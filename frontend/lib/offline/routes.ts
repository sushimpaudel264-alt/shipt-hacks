/**
 * FRONTEND TEAMMATE: set these to your real page routes.
 *
 * Right after a course is downloaded, these pages are fetched and cached by the service worker,
 * so a student can open them offline even if they never visited them while online.
 * Placeholders: {courseId}, {slug}, {lessonId} (patterns with {lessonId} expand per lesson).
 * App-wide pages (dashboard, downloads list) should go in ALWAYS_CACHED_PAGES.
 */
export const OFFLINE_PAGE_ROUTES: string[] = ["/courses/{courseId}", "/courses/{courseId}/lessons/{lessonId}"];

export const ALWAYS_CACHED_PAGES: string[] = ["/", "/offline"];
