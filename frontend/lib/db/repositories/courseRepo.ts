import { CoursePackageSchema, CourseSchema, CourseVersionSchema } from "@/lib/schemas";
import type { Course, CourseUpdateInfo, DownloadedCourse } from "@/lib/types";
import { z } from "zod";
import { getDB, getMeta, setMeta } from "../database";
import { getStudent } from "./studentRepo";
import { buildSyncEvent } from "./syncRepo";

/** Overridable for tests; defaults to same-origin fetch. */
let fetcher: typeof fetch = (...args) => fetch(...args);
export function setCourseFetcher(f: typeof fetch): void {
  fetcher = f;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetcher(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Asks the browser not to evict our data under storage pressure. Chromebooks share disk
 * between many users, so this matters. Only asked once, after the first download.
 */
async function requestPersistentStorage(): Promise<void> {
  if (await getMeta<boolean>("persistRequested")) return;
  await setMeta("persistRequested", true);
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Not supported / denied: downloads still work, just without the eviction guarantee.
  }
}

/** Downloads the full course package and stores it for offline use. Also used to update a course. */
export async function downloadCourse(id: string): Promise<DownloadedCourse> {
  const pkg = CoursePackageSchema.parse(await fetchJson(`/api/courses/${encodeURIComponent(id)}/package`));
  const db = getDB();
  const row: DownloadedCourse = {
    id: pkg.course.id,
    version: pkg.version,
    downloadedAt: new Date().toISOString(),
    sizeBytes: pkg.sizeBytes,
    source: pkg.course.source,
    course: pkg.course,
  };
  await db.transaction("rw", db.coursePackages, db.student, db.syncQueue, async () => {
    const student = await getStudent();
    await db.coursePackages.put(row);
    await db.syncQueue.add(
      buildSyncEvent(student.id, { type: "course-downloaded", payload: { courseId: row.id, version: row.version } }),
    );
  });
  void requestPersistentStorage();
  return row;
}

export async function getDownloaded(): Promise<DownloadedCourse[]> {
  return getDB().coursePackages.orderBy("downloadedAt").reverse().toArray();
}

/** Reads a course from local storage only. Works fully offline. */
export async function getCourse(id: string): Promise<Course | undefined> {
  return (await getDB().coursePackages.get(id))?.course;
}

export async function isDownloaded(id: string): Promise<boolean> {
  return (await getDB().coursePackages.get(id)) !== undefined;
}

/** Removes the course content. Progress, XP and badges are kept (they belong to the student). */
export async function deleteCourse(id: string): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.coursePackages, db.aiCourses, async () => {
    await db.coursePackages.delete(id);
    await db.aiCourses.delete(id);
  });
}

/** Compares local versions with the server. AI-generated courses are local-only and skipped. */
export async function checkForUpdates(): Promise<CourseUpdateInfo[]> {
  const local = (await getDownloaded()).filter((c) => c.source !== "ai-generated");
  if (local.length === 0) return [];
  const ids = local.map((c) => encodeURIComponent(c.id)).join(",");
  const remote = z.array(CourseVersionSchema).parse(await fetchJson(`/api/courses/versions?ids=${ids}`));
  const remoteById = new Map(remote.map((r) => [r.id, r.version]));
  return local.flatMap((c) => {
    const remoteVersion = remoteById.get(c.id);
    return remoteVersion !== undefined && remoteVersion > c.version
      ? [{ id: c.id, localVersion: c.version, remoteVersion }]
      : [];
  });
}

/** Re-downloads the latest version. Lesson ids are stable, so existing progress carries over. */
export async function updateCourse(id: string): Promise<DownloadedCourse> {
  return downloadCourse(id);
}

/**
 * Saves an AI-generated course so it behaves exactly like a downloaded official course:
 * it goes into coursePackages (what the player reads) plus aiCourses (generation history).
 */
export async function saveAICourse(course: Course, meta: { prompt?: string; model?: string } = {}): Promise<DownloadedCourse> {
  const parsed = CourseSchema.parse(course);
  const now = new Date().toISOString();
  const row: DownloadedCourse = {
    id: parsed.id,
    version: parsed.version,
    downloadedAt: now,
    sizeBytes: parsed.sizeBytes,
    source: parsed.source,
    course: parsed,
  };
  const db = getDB();
  await db.transaction("rw", db.coursePackages, db.aiCourses, async () => {
    await db.coursePackages.put(row);
    await db.aiCourses.put({ id: parsed.id, createdAt: now, prompt: meta.prompt ?? "", model: meta.model ?? "", course: parsed });
  });
  void requestPersistentStorage();
  return row;
}

export async function getAICourses() {
  return getDB().aiCourses.orderBy("createdAt").reverse().toArray();
}
