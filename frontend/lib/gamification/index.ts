/** Pure, offline-capable XP / streak / badge rules. No I/O. */
export { calculateLessonXP, quizBonusXP, getLevel, isAnswerCorrect, scoreQuiz, type QuizScore } from "./xp";
export { toLocalDate, daysBetween, addDays, updateStreak, streakFromDates, type StreakChange } from "./streak";
export { evaluateBadges, getBadge } from "./badges";
