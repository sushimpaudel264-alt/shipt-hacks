/**
 * Service worker registration + page pre-warming.
 * The SW is only registered in production builds (or with NEXT_PUBLIC_ENABLE_SW=true), because
 * caching dev bundles causes confusing stale-code bugs during development.
 */

/**
 * Which pages to cache for offline use. Configured by the UI through
 * <LearnLoopProvider offlinePages={...}> (see FRONTEND_GUIDE.md), so nobody has to edit lib/.
 * Placeholders: {courseId}, {slug}, {lessonId} (patterns with {lessonId} expand once per lesson).
 */
export interface OfflinePagesConfig {
  /** Cached right after a course is downloaded or AI-generated. */
  course: string[];
  /** Cached once when the app starts. */
  always: string[];
}

export const DEFAULT_OFFLINE_PAGES: OfflinePagesConfig = {
  course: ["/courses/{courseId}", "/courses/{courseId}/lessons/{lessonId}"],
  always: ["/", "/offline"],
};

let offlinePages: OfflinePagesConfig = DEFAULT_OFFLINE_PAGES;

export function setOfflinePages(config: Partial<OfflinePagesConfig>): void {
  offlinePages = { ...DEFAULT_OFFLINE_PAGES, ...config };
}

function isServiceWorkerEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true")
  );
}

/** Registers /sw.js and pre-caches the "always" pages. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerEnabled()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    void cachePages(offlinePages.always);
    return reg;
  } catch (err) {
    console.warn("[learnloop] service worker registration failed", err);
    return null;
  }
}

/** Asks the SW to fetch + cache these page URLs now, so they open offline later. */
export async function cachePages(urls: string[]): Promise<void> {
  if (!isServiceWorkerEnabled() || urls.length === 0) return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: "LEARNLOOP_CACHE_URLS", urls });
}

/** Caches every configured page for a course (called after download / AI generation). */
export function cacheCoursePages(course: { id: string; slug: string; lessons: { id: string }[] }): Promise<void> {
  const fill = (pattern: string, lessonId = "") =>
    pattern
      .replace("{courseId}", encodeURIComponent(course.id))
      .replace("{slug}", encodeURIComponent(course.slug))
      .replace("{lessonId}", encodeURIComponent(lessonId));
  const urls = offlinePages.course.flatMap((p) => (p.includes("{lessonId}") ? course.lessons.map((l) => fill(p, l.id)) : [fill(p)]));
  return cachePages(urls);
}
