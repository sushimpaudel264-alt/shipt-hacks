// Connectivity probe used by the sync engine (navigator.onLine alone can't detect "WiFi but no internet").
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
