"use client";
import { useQuery } from "@tanstack/react-query";
import { getDB } from "@/lib/db/database";
import { LOCAL, queryKeys } from "./queryKeys";

export interface StorageEstimate {
  /** Bytes used by this origin (all storage), if the browser reports it. */
  usageBytes: number | null;
  quotaBytes: number | null;
  /** Sum of downloaded course package sizes. Always available. */
  coursesBytes: number;
  downloadedCount: number;
  /** True if the browser granted persistent storage (won't evict under pressure). */
  persisted: boolean | null;
  supported: boolean;
}

export function useStorageEstimate() {
  return useQuery({
    queryKey: queryKeys.storage,
    ...LOCAL,
    queryFn: async (): Promise<StorageEstimate> => {
      const rows = await getDB().coursePackages.toArray();
      const coursesBytes = rows.reduce((sum, r) => sum + r.sizeBytes, 0);
      const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
      const est = await storage?.estimate?.().catch(() => undefined);
      const persisted = (await storage?.persisted?.().catch(() => null)) ?? null;
      return {
        usageBytes: est?.usage ?? null,
        quotaBytes: est?.quota ?? null,
        coursesBytes,
        downloadedCount: rows.length,
        persisted,
        supported: !!storage?.estimate,
      };
    },
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
