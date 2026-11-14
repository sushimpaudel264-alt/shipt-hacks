import type { Badge } from "@/lib/types";

export const BADGES: Badge[] = [
  { id: "first-lesson", name: "First Lesson", emoji: "🌱", description: "Finished your very first lesson!", rule: { type: "lessons-completed", count: 1 } },
  { id: "coding-explorer", name: "Coding Explorer", emoji: "💻", description: "Completed 3 coding lessons.", rule: { type: "category-lessons", category: "coding", count: 3 } },
  { id: "math-master", name: "Math Master", emoji: "🧮", description: "Completed 3 math lessons.", rule: { type: "category-lessons", category: "math", count: 3 } },
  { id: "science-star", name: "Science Star", emoji: "🔬", description: "Completed 3 science lessons.", rule: { type: "category-lessons", category: "science", count: 3 } },
  { id: "streak-7", name: "7 Day Streak", emoji: "🔥", description: "Learned something 7 days in a row.", rule: { type: "streak", days: 7 } },
  { id: "streak-30", name: "30 Day Streak", emoji: "🏆", description: "Learned something 30 days in a row!", rule: { type: "streak", days: 30 } },
  { id: "xp-100", name: "100 XP Club", emoji: "⭐", description: "Earned 100 XP.", rule: { type: "xp", amount: 100 } },
  { id: "xp-500", name: "500 XP Club", emoji: "🌟", description: "Earned 500 XP.", rule: { type: "xp", amount: 500 } },
];
