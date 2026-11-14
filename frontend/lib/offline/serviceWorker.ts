/**
 * Service worker registration + page pre-warming.
 * The SW is only registered in production builds (or with NEXT_PUBLIC_ENABLE_SW=true), because
 * caching dev bundles causes confusing stale-code bugs during development.
 */
import { OFFLINE_PAGE_ROUTES } from "./routes";

export function isServiceWorkerEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "true")
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerEnabled()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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

/** Expands OFFLINE_PAGE_ROUTES for a course so its pages are cached right after download. */
export function pagesForCourse(course: { id: string; slug: string; lessons: { id: string }[] }): string[] {
  return OFFLINE_PAGE_ROUTES.flatMap((pattern) =>
    pattern.includes("{lessonId}")
      ? course.lessons.map((l) => fill(pattern, course, l.id))
      : [fill(pattern, course)],
  );
}

function fill(pattern: string, course: { id: string; slug: string }, lessonId?: string): string {
  return pattern
    .replace("{courseId}", encodeURIComponent(course.id))
    .replace("{slug}", encodeURIComponent(course.slug))
    .replace("{lessonId}", encodeURIComponent(lessonId ?? ""));
}
