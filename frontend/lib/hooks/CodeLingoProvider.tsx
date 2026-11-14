"use client";
/**
 * Wrap the app with <CodeLingoProvider> once (app/layout.tsx). It:
 *  - creates the React Query client (offline-friendly defaults),
 *  - seeds the local student on first run,
 *  - starts the sync engine (startup / online / 60s interval / Background Sync triggers),
 *  - registers the service worker (production only) and caches your offline pages.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { studentRepo } from "@/lib/db";
import { registerServiceWorker, setOfflinePages, startSyncEngine, type OfflinePagesConfig } from "@/lib/sync";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // "offlineFirst": try once even when navigator says offline (it's often wrong), don't spin retrying.
      queries: { networkMode: "offlineFirst", staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { networkMode: "offlineFirst" },
    },
  });
}

export interface CodeLingoProviderProps {
  children: ReactNode;
  /**
   * Page URL patterns to cache for offline use. Defaults:
   * course: ["/courses/{courseId}", "/courses/{courseId}/lessons/{lessonId}"], always: ["/", "/offline"].
   */
  offlinePages?: Partial<OfflinePagesConfig>;
}

export function CodeLingoProvider({ children, offlinePages }: CodeLingoProviderProps) {
  const [queryClient] = useState(makeQueryClient);

  // Set synchronously so download hooks see the config on the first render.
  if (offlinePages) setOfflinePages(offlinePages);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void studentRepo
      .getStudent()
      .catch((err) => console.error("[codelingo] could not open local database", err))
      .finally(() => {
        stop = startSyncEngine();
      });
    void registerServiceWorker();
    return () => stop?.();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
