// Bridge between the CodeLingo UI (this folder) and the CodeLingo data layer (lib/db, lib/sync,
// app/api). The UI keeps its own view model (courses as a flat list of items); everything real
// (course content, downloads, progress, XP, badges, streaks, sync) comes from the data layer.
import { courseRepo, progressRepo, studentRepo, getMeta, setMeta } from '@/lib/db';
import { BADGES as DATA_BADGES } from '@/lib/mock';
import { notifyLocalChange, syncNow as engineSync, getSyncState, subscribeSyncState } from '@/lib/sync';
import { ApiError } from './api';

/* ---------- Course mapping: data-layer Course → UI course ---------- */

const SUBJECT = { coding: 'coding', math: 'math', science: 'science' };
export const QUIZ_SUFFIX = '~quiz';

function sectionMarkdown(s) {
  const parts = [`## ${s.title}`, s.body];
  if (s.code) parts.push(`~~~\n${s.code}\n~~~`);
  if (s.activity) {
    const a = s.activity;
    parts.push(`**Try it:** ${a.prompt}`);
    if (a.options?.length) parts.push(a.options.map((o) => `- ${o}`).join('\n'));
    if (a.hint) parts.push(`*Hint:* ${a.hint}`);
    parts.push(`*Answer:* ${a.answer}${a.successMessage ? ` · ${a.successMessage}` : ''}`);
  }
  if (s.hint) parts.push(`*Hint:* ${s.hint}`);
  if (s.solution) parts.push(`*Solution:*\n\n~~~\n${s.solution}\n~~~`);
  return parts.join('\n\n');
}

// The quiz screen shows question text as plain text, so drop Markdown code backticks for display.
// Submitted values (`values`, `correct`) are untouched, so grading is unaffected.
const plain = (t) => (t == null ? t : String(t).replace(/`/g, ''));

function toQuestion(q) {
  if (q.type === 'fill-in-the-blank') {
    return { id: q.id, prompt: plain(q.prompt), fill: true, correct: q.correctAnswer, accept: q.acceptableAnswers || [], choices: [], answer: -1, explanation: plain(q.explanation) };
  }
  const choices = q.type === 'true-false' ? ['true', 'false'] : q.options || [];
  return {
    id: q.id,
    prompt: plain(q.prompt),
    choices: q.type === 'true-false' ? ['True', 'False'] : choices.map(plain),
    answer: choices.indexOf(q.correctAnswer),
    values: choices, // what is submitted to the data layer for each choice
    explanation: plain(q.explanation),
  };
}

/** One data-layer lesson becomes two UI items: the lesson (sections as Markdown) and its quiz. */
export function toUiCourse(course) {
  const lessons = [...course.lessons].sort((a, b) => a.order - b.order);
  return {
    id: course.id,
    version: course.version,
    title: course.title,
    description: course.description,
    subject: SUBJECT[course.category] || 'other',
    difficulty: course.difficulty,
    icon: course.thumbnailEmoji || '📘',
    thumbnail: null,
    items: lessons.flatMap((l) => [
      {
        id: l.id,
        type: 'lesson',
        title: l.title,
        minutes: l.estimatedMinutes || 10,
        body: [l.summary, ...l.sections.map(sectionMarkdown)].filter(Boolean).join('\n\n'),
      },
      {
        id: l.id + QUIZ_SUFFIX,
        type: 'quiz',
        title: `Quiz: ${l.title}`,
        minutes: Math.max(2, l.quiz.questions.length),
        body: '',
        lessonId: l.id,
        passingScore: l.quiz.passingScore, // the data layer's pass mark (shown and used by the quiz screen)
        questions: l.quiz.questions.map(toQuestion),
      },
    ]),
  };
}

/** Which data-layer lesson a UI item belongs to. */
export const lessonIdOf = (item) => item.lessonId || item.id;

/* ---------- API (same surface the UI used before) ---------- */

async function getJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-store' });
  } catch {
    throw new ApiError("You're offline or the server can't be reached.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message || `Request failed (${res.status})`, res.status);
  return body;
}

const summaryOf = (c) => {
  const { items, ...rest } = c;
  return { ...rest, items: items.map(({ id, type, title, minutes }) => ({ id, type, title, minutes })), minutes: items.reduce((s, i) => s + i.minutes, 0) };
};

export function createBackendApi() {
  return {
    me: async () => DEMO_USER(),
    logout: async () => ({}),
    async getCourses() {
      const list = await getJson('/api/courses');
      const full = await Promise.all(list.map((c) => getJson(`/api/courses/${encodeURIComponent(c.id)}`)));
      return full.map((c) => summaryOf(toUiCourse(c)));
    },
    async getCourse(id) {
      const local = await courseRepo.getCourse(id);
      return toUiCourse(local || (await getJson(`/api/courses/${encodeURIComponent(id)}`)));
    },
    /** Rankings: the data layer has a single demo student, so only that student is listed. */
    async leaderboard() {
      const s = await studentRepo.getStudent();
      const row = { rank: 1, name: s.name, xp: s.xp, week_xp: s.xp, is_me: true };
      return { all_time: [row], this_week: [row], students: 1 };
    },
    async resetProgress() {
      throw new ApiError('Resetting progress is not available in demo mode.', 400);
    },
  };
}

/* ---------- Demo student (no accounts) ---------- */

let student = null;
export const DEMO_USER = () => ({ username: 'jordan', display_name: student?.name || 'Jordan', role: 'student' });
export const getStudentSnapshot = () => student;
export async function refreshStudent() {
  student = await studentRepo.getStudent();
  return student;
}

/* ---------- Downloads (IndexedDB via courseRepo) ---------- */

const toRecord = (row) => ({
  id: row.id,
  version: row.version,
  title: row.course.title,
  bytes: row.sizeBytes,
  downloadedAt: row.downloadedAt,
  course: toUiCourse(row.course),
});

export const downloads = {
  list: async () => (await courseRepo.getDownloaded()).map(toRecord),
  async get(id) {
    const row = (await courseRepo.getDownloaded()).find((r) => r.id === id);
    return row ? toRecord(row) : undefined;
  },
  async save(course) {
    const row = await courseRepo.downloadCourse(course.id);
    void notifyLocalChange();
    return toRecord(row);
  },
  remove: (id) => courseRepo.deleteCourse(id),
};

export const meta = {
  get: (key) => getMeta(`ui:${key}`),
  set: (key, value) => setMeta(`ui:${key}`, value),
};

/* ---------- Progress, XP, badges (progressRepo) ---------- */

/** Rebuilds the UI's done/quiz markers from the data layer (the source of truth). */
export async function loadProgressInto(store) {
  const rows = await progressRepo.getAllProgress();
  for (const p of rows) {
    if (p.status === 'completed') store.done[`${p.courseId}/${p.lessonId}`] ||= p.completedAt;
    if (p.score !== null) {
      const key = `${p.courseId}/${p.lessonId}${QUIZ_SUFFIX}`;
      store.done[key] ||= p.updatedAt;
    }
  }
  await refreshStudent();
  for (const a of student.achievements) store.badges[a.badgeId] ||= a.unlockedAt;
}

export async function completeLesson(courseId, item) {
  const outcome = await progressRepo.completeLesson({ courseId, lessonId: lessonIdOf(item) });
  await refreshStudent();
  void notifyLocalChange();
  return outcome;
}

export async function submitQuiz(courseId, item, answers) {
  const outcome = await progressRepo.submitQuiz({ courseId, lessonId: lessonIdOf(item), answers });
  await refreshStudent();
  void notifyLocalChange();
  return outcome;
}

/** Badge catalog in the UI's shape. */
export const BADGES = DATA_BADGES.map((b) => ({ id: b.id, icon: b.emoji, name: b.name, desc: b.description }));

/* ---------- Sync (lib/sync engine) ---------- */

export const sync = {
  now: () => engineSync({ force: true }),
  state: getSyncState,
  subscribe: subscribeSyncState,
};
