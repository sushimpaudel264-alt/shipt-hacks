/**
 * Real connectivity check. navigator.onLine only knows whether a network interface is up;
 * a Chromebook on home WiFi with no internet still reports "online". So we ping /api/health.
 */
const HEALTH_TIMEOUT_MS = 5000;

export async function checkHealth(timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Cache-busting query + no-store so neither the HTTP cache nor the service worker can fake success.
    const res = await fetchImpl(`/api/health?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
