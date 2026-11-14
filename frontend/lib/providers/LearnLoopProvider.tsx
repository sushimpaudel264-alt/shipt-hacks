"use client";
/**
 * Wrap the app with <LearnLoopProvider> once (app/layout.tsx). It:
 *  - creates the React Query client (offline-friendly defaults),
 *  - seeds the local student on first run,
 *  - starts the sync engine (startup / online / 60s interval / Background Sync triggers),
 *  - registers the service worker (production only).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { getStudent } from "@/lib/db/repositories/studentRepo";
import { ALWAYS_CACHED_PAGES } from "@/lib/offline/routes";
import { cachePages, registerServiceWorker } from "@/lib/offline/serviceWorker";
import { startSyncEngine } from "@/lib/sync/syncEngine";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // "offlineFirst": try once even when navigator says offline (it's often wrong), don't spin retrying.
      queries: { networkMode: "offlineFirst", staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { networkMode: "offlineFirst" },
    },
  });
}

export function LearnLoopProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void getStudent()
      .catch((err) => console.error("[learnloop] could not open local database", err))
      .finally(() => {
        stop = startSyncEngine();
      });
    void registerServiceWorker().then((reg) => reg && cachePages(ALWAYS_CACHED_PAGES));
    return () => stop?.();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
