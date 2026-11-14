import { handle, listOrganizations, ok } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET /api/organizations → Organization[]. */
export const GET = handle(async () => ok(listOrganizations()));
