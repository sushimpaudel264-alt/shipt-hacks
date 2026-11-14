import { handle, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/health → { ok: true, time }. Real connectivity probe (navigator.onLine can't detect dead WiFi). */
export const GET = handle(async () => ok({ ok: true, time: new Date().toISOString() }));
