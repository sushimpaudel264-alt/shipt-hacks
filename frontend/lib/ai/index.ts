import "server-only";
/** Server-only AI services (Gemini with mock fallback) + the shared AI route guard. */
export { generateCourse } from "./generateCourse";
export { generateQuiz } from "./generateQuiz";
export { generateLearningPath } from "./generateLearningPath";
export { answerStudentQuestion } from "./answerStudentQuestion";
export { getAIConfig, AIOutputError } from "./gemini";
export { aiGuard, runAI } from "./route";
