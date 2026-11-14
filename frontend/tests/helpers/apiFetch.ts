/**
 * Routes relative fetch() calls straight into the Next.js route handlers, with an "offline" switch.
 * Lets tests exercise the real client repositories + sync engine against the real API code.
 */
import * as aiCourse from "@/app/api/ai/generate-course/route";
import * as aiPath from "@/app/api/ai/learning-path/route";
import * as aiQuiz from "@/app/api/ai/generate-quiz/route";
import * as aiTutor from "@/app/api/ai/tutor/route";
import * as contribCourse from "@/app/api/contributor/courses/[id]/route";
import * as contribPublish from "@/app/api/contributor/courses/[id]/publish/route";
import * as contribCourses from "@/app/api/contributor/courses/route";
import * as course from "@/app/api/courses/[id]/route";
import * as coursePackage from "@/app/api/courses/[id]/package/route";
import * as courses from "@/app/api/courses/route";
import * as versions from "@/app/api/courses/versions/route";
import * as health from "@/app/api/health/route";
import * as sync from "@/app/api/sync/route";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "DELETE", Handler>>;

const r = (m: unknown) => m as RouteModule;

const routes: [RegExp, RouteModule][] = (
  [
  [/^\/api\/health$/, health],
  [/^\/api\/courses$/, courses],
  [/^\/api\/courses\/versions$/, versions],
  [/^\/api\/courses\/([^/]+)\/package$/, coursePackage],
  [/^\/api\/courses\/([^/]+)$/, course],
  [/^\/api\/sync$/, sync],
  [/^\/api\/contributor\/courses$/, contribCourses],
  [/^\/api\/contributor\/courses\/([^/]+)\/publish$/, contribPublish],
  [/^\/api\/contributor\/courses\/([^/]+)$/, contribCourse],
  [/^\/api\/ai\/generate-course$/, aiCourse],
  [/^\/api\/ai\/generate-quiz$/, aiQuiz],
  [/^\/api\/ai\/learning-path$/, aiPath],
  [/^\/api\/ai\/tutor$/, aiTutor],
  ] as [RegExp, unknown][]
).map(([re, m]) => [re, r(m)]);

export const network = { online: true, requests: [] as string[] };

export const apiFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost");
  network.requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
  if (!network.online) throw new TypeError("Failed to fetch");
  for (const [re, mod] of routes) {
    const m = url.pathname.match(re);
    if (!m) continue;
    const method = (init?.method ?? "GET").toUpperCase() as keyof RouteModule;
    const handler = mod[method];
    if (!handler) return new Response(null, { status: 405 });
    const req = new Request(url, { ...init, signal: undefined });
    return handler(req, { params: Promise.resolve<Record<string, string>>(m[1] ? { id: decodeURIComponent(m[1]) } : {}) });
  }
  return new Response(null, { status: 404 });
};
