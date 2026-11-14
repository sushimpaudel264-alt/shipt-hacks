"use client";
import { useCallback, useEffect, useState } from "react";
import { checkHealth } from "@/lib/sync/connectivity";

export interface OnlineStatus {
  /** navigator.onLine: the device has a network interface up. */
  isOnline: boolean;
  /** /api/health actually answered. This is the one to trust for "can I reach LearnLoop?". */
  isReachable: boolean;
  lastCheckedAt: string | null;
  recheck: () => Promise<boolean>;
}

const RECHECK_MS = 30_000;

/** Combines navigator.onLine with real /api/health checks (navigator.onLine lies on captive/dead WiFi). */
export function useOnlineStatus(): OnlineStatus {
  // Start optimistic to match SSR; the first effect corrects it.
  const [isOnline, setIsOnline] = useState(true);
  const [isReachable, setIsReachable] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    const ok = await checkHealth();
    setIsReachable(ok);
    setLastCheckedAt(new Date().toISOString());
    return ok;
  }, []);

  useEffect(() => {
    const update = () => {
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) setIsReachable(false);
      else void recheck();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const id = setInterval(() => navigator.onLine && void recheck(), RECHECK_MS);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(id);
    };
  }, [recheck]);

  return { isOnline, isReachable: isOnline && isReachable, lastCheckedAt, recheck };
}
