// XP, streaks, badges and learning history, computed from the progress document and
// the course catalog so they work offline. The server computes XP the same way for
// the leaderboard (backend/progress.py).
import { localISO } from './util';

export const XP_PER_MINUTE = 10;

export const BADGES = [
  { id: 'first-lesson', icon: '🌱', name: 'First Lesson', desc: 'Complete your first lesson or activity.' },
  { id: 'coding-explorer', icon: '🧭', name: 'Coding Explorer', desc: 'Complete 5 lessons in Coding courses.' },
  { id: 'math-master', icon: '📐', name: 'Math Master', desc: 'Finish every lesson in a Math course.' },
  { id: 'science-star', icon: '🔬', name: 'Science Star', desc: 'Finish every lesson in a Science course.' },
  { id: 'streak-7', icon: '🔥', name: '7 Day Streak', desc: 'Learn something 7 days in a row.' },
  { id: 'streak-30', icon: '⚡', name: '30 Day Streak', desc: 'Learn something 30 days in a row.' },
];

export const keyOf = (courseId, itemId) => `${courseId}/${itemId}`;

function streaks(days) {
  const have = new Set(days);
  const d = new Date();
  if (!have.has(localISO(d))) d.setDate(d.getDate() - 1); // the streak lasts until today ends
  let current = 0;
  while (have.has(localISO(d))) { current++; d.setDate(d.getDate() - 1); }

  let best = 0, run = 0, prev = null;
  for (const day of [...have].sort()) {
    const t = new Date(day + 'T12:00:00');
    run = prev && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best };
}

/** Per-course progress, totals and badge eligibility. `catalog` is the list of course summaries. */
export function computeStats(progress, catalog) {
  let xp = 0, lessons = 0, minutes = 0, codingDone = 0;
  const perCourse = new Map();
  const completedCourses = [];
  for (const c of catalog) {
    let done = 0;
    for (const item of c.items) {
      if (!progress.done[keyOf(c.id, item.id)]) continue;
      done++;
      lessons++;
      minutes += item.minutes;
      xp += item.minutes * XP_PER_MINUTE;
      if (c.subject === 'coding') codingDone++;
    }
    const total = c.items.length;
    perCourse.set(c.id, { done, total, pct: total ? Math.round((done / total) * 100) : 0 });
    if (total && done === total) completedCourses.push(c);
  }
  const { current, best } = streaks(progress.days);
  return { xp, lessons, minutes, codingDone, perCourse, completedCourses, streak: current, bestStreak: best };
}

/** Badge ids the learner qualifies for right now. */
export function qualifiedBadges(stats) {
  const ids = [];
  if (stats.lessons >= 1) ids.push('first-lesson');
  if (stats.codingDone >= 5) ids.push('coding-explorer');
  if (stats.completedCourses.some((c) => c.subject === 'math')) ids.push('math-master');
  if (stats.completedCourses.some((c) => c.subject === 'science')) ids.push('science-star');
  if (stats.bestStreak >= 7) ids.push('streak-7');
  if (stats.bestStreak >= 30) ids.push('streak-30');
  return ids;
}

/** Record newly qualified badges in progress.badges; returns the newly earned badges. */
export function awardBadges(progress, stats) {
  const earned = [];
  for (const id of qualifiedBadges(stats)) {
    if (!progress.badges[id]) {
      progress.badges[id] = new Date().toISOString();
      earned.push(BADGES.find((b) => b.id === id));
    }
  }
  return earned;
}

/** Completed items, newest first: [{ at, course, item }]. */
export function learningHistory(progress, catalog) {
  const byKey = new Map();
  for (const c of catalog) for (const item of c.items) byKey.set(keyOf(c.id, item.id), { course: c, item });
  return Object.entries(progress.done)
    .filter(([key]) => byKey.has(key))
    .map(([key, at]) => ({ at: typeof at === 'string' ? at : null, ...byKey.get(key) }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
