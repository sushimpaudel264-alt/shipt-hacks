import { SyncRequestSchema } from "@/lib/schemas";
import { handle, ok, processSyncBatch, readJson } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync { events: SyncEvent[] (max 50) } → { acknowledgedIds, serverStudentState }.
 * Idempotent: replayed event ids are acknowledged but never re-applied.
 */
export const POST = handle(async (req: Request) => {
  const { events } = await readJson(req, SyncRequestSchema);
  return ok(processSyncBatch(events));
});
