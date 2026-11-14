/**
 * IndexedDB (Dexie) database "codelingo": the source of truth for everything offline.
 * Browser-only: never call getDB() during SSR (it throws a clear error instead of crashing obscurely).
 */
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Course, DownloadedCourse, Progress, QuizResult, Student, SyncEvent } from "@/lib/types";

export interface AICourseRow {
  id: string;
  createdAt: string;
  prompt: string;
  model: string;
  course: Course;
}

interface MetaRow {
  key: string;
  value: unknown;
}

export class CodeLingoDB extends Dexie {
  coursePackages!: EntityTable<DownloadedCourse, "id">;
  aiCourses!: EntityTable<AICourseRow, "id">;
  progress!: Table<Progress, [string, string]>;
  quizResults!: EntityTable<QuizResult, "id">;
  student!: EntityTable<Student, "id">;
  syncQueue!: EntityTable<SyncEvent, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor(name = "codelingo") {
    super(name);
    this.version(1).stores({
      coursePackages: "id, version, downloadedAt, sizeBytes, source",
      aiCourses: "id, createdAt",
      progress: "[courseId+lessonId], courseId, updatedAt",
      quizResults: "id, lessonId, courseId, submittedAt",
      student: "id",
      syncQueue: "id, status, createdAt",
      meta: "key",
    });
  }
}

let instance: CodeLingoDB | null = null;

export function isBrowserDBAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function getDB(): CodeLingoDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("CodeLingo database is only available in the browser (IndexedDB missing).");
  }
  instance ??= new CodeLingoDB();
  return instance;
}

/** Tests only: swap in a fresh database (e.g. backed by fake-indexeddb). */
export function setDBForTests(db: CodeLingoDB | null): void {
  instance = db;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDB().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDB().meta.put({ key, value });
}
