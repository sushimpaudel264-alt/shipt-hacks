"use client";
/**
 * BACKEND DIAGNOSTICS PAGE (not part of the student UI).
 * A bare-bones harness that exercises every data hook, so the frontend teammate has a working
 * usage reference and judges/devs can verify the offline flow even before the real UI lands.
 */
import { useState } from "react";
import {
  formatBytes,
  useCompleteLesson,
  useCourses,
  useDeleteCourse,
  useDownloadCourse,
  useDownloadedCourses,
  useGenerateCourse,
  useOnlineStatus,
  useProgress,
  useStorageEstimate,
  useStudent,
  useSubmitQuiz,
  useSyncStatus,
  useTutor,
} from "@/lib/hooks";
import type { Course, LearningOutcome } from "@/lib/types";

const box = "rounded border border-zinc-300 p-3 dark:border-zinc-700";
const btn = "rounded bg-zinc-800 px-2 py-1 text-sm text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-black";

function CourseActions({ course, onOutcome }: { course: Course; onOutcome: (o: LearningOutcome) => void }) {
  const progress = useProgress(course.id);
  const complete = useCompleteLesson();
  const quiz = useSubmitQuiz();
  const remove = useDeleteCourse();
  const status = (lessonId: string) => progress.data?.find((p) => p.lessonId === lessonId);
  return (
    <li className={box} data-testid={`downloaded-${course.id}`}>
      <b>
        {course.thumbnailEmoji} {course.title}
      </b>{" "}
      <span className="text-xs">({course.source})</span>{" "}
      <button className={btn} onClick={() => remove.mutate(course.id)}>
        Remove
      </button>
      <ul className="mt-2 space-y-1">
        {course.lessons.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {l.order}. {l.title}: <i data-testid={`status-${l.id}`}>{status(l.id)?.status ?? "not-started"}</i>
              {status(l.id)?.score != null && ` (best ${status(l.id)?.score}%)`}
            </span>
            <button className={btn} data-testid={`complete-${l.id}`} onClick={() => complete.mutate({ courseId: course.id, lessonId: l.id }, { onSuccess: onOutcome })}>
              Complete lesson
            </button>
            <button
              className={btn}
              data-testid={`quiz-${l.id}`}
              onClick={() =>
                quiz.mutate(
                  { courseId: course.id, lessonId: l.id, answers: l.quiz.questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer })) },
                  { onSuccess: onOutcome },
                )
              }
            >
              Submit perfect quiz
            </button>
          </li>
        ))}
      </ul>
      {(complete.error || quiz.error) && <p className="text-red-600">{(complete.error ?? quiz.error)?.message}</p>}
    </li>
  );
}

export default function DataDebugPage() {
  const student = useStudent();
  const online = useOnlineStatus();
  const sync = useSyncStatus();
  const catalog = useCourses();
  const downloaded = useDownloadedCourses();
  const download = useDownloadCourse();
  const storage = useStorageEstimate();
  const generate = useGenerateCourse();
  const tutor = useTutor({ lessonTitle: "Variables" });
  const [topic, setTopic] = useState("I want to learn Python.");
  const [lastOutcome, setLastOutcome] = useState<LearningOutcome | null>(null);
  const downloadedIds = new Set(downloaded.data?.map((d) => d.id));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 font-mono text-sm">
      <h1 className="text-xl font-bold">CodeLingo data layer diagnostics</h1>

      <section className={box}>
        <h2 className="font-bold">Connectivity &amp; sync</h2>
        <p>
          navigator.onLine: {String(online.isOnline)} · reachable: <span data-testid="reachable">{String(online.isReachable)}</span>
        </p>
        <p>
          sync status: <b data-testid="sync-status">{sync.status}</b> · queued: <span data-testid="queued-count">{sync.queuedCount}</span> · failed: {sync.failedCount} · last synced:{" "}
          {sync.lastSyncedAt ?? "never"} {sync.lastError && <span className="text-red-600">· {sync.lastError}</span>}
        </p>
        <button className={btn} data-testid="sync-now" onClick={() => void sync.syncNow()}>
          Sync now
        </button>{" "}
        {sync.failedCount > 0 && (
          <button className={btn} onClick={() => void sync.retryFailed()}>
            Retry failed
          </button>
        )}
      </section>

      <section className={box}>
        <h2 className="font-bold">Student</h2>
        {student.data && (
          <>
            <p>
              {student.data.avatarEmoji} {student.data.name} · XP <b data-testid="xp">{student.data.xp}</b> · level {student.data.level} · streak{" "}
              <b data-testid="streak">{student.data.streak.current}</b> 🔥 (longest {student.data.streak.longest})
            </p>
            <p data-testid="badges">Badges: {student.data.badges.map((b) => `${b.emoji} ${b.name}`).join(", ")}</p>
          </>
        )}
        {lastOutcome && (
          <p data-testid="last-outcome">
            Last: +{lastOutcome.xpAwarded} XP{lastOutcome.newBadges.length > 0 && ` · NEW BADGE: ${lastOutcome.newBadges.map((b) => b.name).join(", ")}`}
            {lastOutcome.streakIncreased && " · streak up!"}
            {lastOutcome.quizResult && ` · quiz ${lastOutcome.quizResult.score}%`}
          </p>
        )}
      </section>

      <section className={box}>
        <h2 className="font-bold">Catalog ({catalog.data?.source ?? "…"})</h2>
        <ul>
          {catalog.data?.courses.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {c.thumbnailEmoji} {c.title} · v{c.version} · {formatBytes(c.sizeBytes)}{" "}
              {downloadedIds.has(c.id) ? (
                <span>✅ downloaded</span>
              ) : (
                <button className={btn} data-testid={`download-${c.id}`} disabled={download.isPending} onClick={() => download.mutate(c.id)}>
                  Download
                </button>
              )}
            </li>
          ))}
        </ul>
        {download.error && <p className="text-red-600">{download.error.message}</p>}
      </section>

      <section className={box}>
        <h2 className="font-bold">On this device</h2>
        <ul className="space-y-2">
          {downloaded.data?.map((d) => <CourseActions key={d.id} course={d.course} onOutcome={setLastOutcome} />)}
        </ul>
        {storage.data && (
          <p className="mt-2">
            Courses: {formatBytes(storage.data.coursesBytes)} · origin usage {formatBytes(storage.data.usageBytes)} of {formatBytes(storage.data.quotaBytes)} · persisted:{" "}
            {String(storage.data.persisted)}
          </p>
        )}
      </section>

      <section className={box}>
        <h2 className="font-bold">AI {generate.isOffline && "(offline: unavailable)"}</h2>
        <input className="w-64 border px-1" value={topic} maxLength={100} onChange={(e) => setTopic(e.target.value)} />{" "}
        <button className={btn} data-testid="generate" disabled={generate.isPending || generate.isOffline} onClick={() => generate.mutate({ topic })}>
          {generate.isPending ? "Generating…" : "Generate + save course"}
        </button>
        {generate.data && <p data-testid="generated">Saved: {generate.data.generated.course.title} ({generate.data.generated.model})</p>}
        {generate.error && <p className="text-red-600">{generate.error.message}</p>}
        <div className="mt-2">
          <button className={btn} data-testid="ask-nova" disabled={tutor.isThinking || tutor.isOffline} onClick={() => void tutor.ask("What is a variable?")}>
            Ask Nova &quot;What is a variable?&quot;
          </button>
          {tutor.isOffline && <p>{tutor.offlineMessage}</p>}
          {tutor.messages.map((m) => (
            <p key={m.id} data-testid={`tutor-${m.role}`}>
              <b>{m.role}:</b> {m.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
