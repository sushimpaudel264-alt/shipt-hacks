/** IndexedDB (Dexie) database + repositories. Browser-only. */
export { getDB, getMeta, setMeta, setDBForTests, LearnLoopDB, type AICourseRow } from "./database";
export * as courseRepo from "./repositories/courseRepo";
export * as progressRepo from "./repositories/progressRepo";
export * as studentRepo from "./repositories/studentRepo";
export * as syncRepo from "./repositories/syncRepo";
