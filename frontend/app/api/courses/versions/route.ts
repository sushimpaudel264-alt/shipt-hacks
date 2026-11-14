import { z } from "zod";
import { getCourseVersions } from "@/lib/server/courses";
import { handle, ok, parseWith } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const IdsSchema = z.array(z.string().min(1).max(120)).max(100);

/** GET /api/courses/versions?ids=a,b,c → { id, version }[] (unknown/unpublished ids omitted). */
export const GET = handle(async (req: Request) => {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = parseWith(IdsSchema, raw.split(",").map((s) => s.trim()).filter(Boolean));
  return ok(getCourseVersions(ids), 200, { "Cache-Control": "no-store" });
});
