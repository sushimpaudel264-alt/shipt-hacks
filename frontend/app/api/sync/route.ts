import { SyncRequestSchema } from "@/lib/schemas";
import { handle, ok, readJson } from "@/lib/server/http";
import { processSyncBatch } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync  { events: SyncEvent[] (max 50) } → { acknowledgedIds, serverStudentState }
 * Idempotent: replayed event ids are acknowledged but never re-applied.
 */
export const POST = handle(async (req: Request) => {
  const { events } = await readJson(req, SyncRequestSchema);
  return ok(processSyncBatch(events), 200, { "Cache-Control": "no-store" });
});
