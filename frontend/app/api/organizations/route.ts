import { listOrganizations } from "@/lib/server/courses";
import { handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(listOrganizations()));
