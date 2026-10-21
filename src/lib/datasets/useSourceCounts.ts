import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { NtaBoundary } from "@/lib/api/nta";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import type { AggregateResult } from "@/lib/geo/types";
import { windowBounds, type WindowId } from "@/lib/windows";
import { countsFromAggregate, fetchSourceCounts, type SourceCounts } from "./fetchSource";
import { SOURCE_BY_ID } from "./registry";

export interface SourceStatus {
  isLoading: boolean;
  error: string | null;
}

export interface SourceCountsState {
  counts: Record<string, SourceCounts | undefined>;
  status: Record<string, SourceStatus>;
}

/**
 * Loads every enabled registry source through TanStack Query (one cached query
 * per source × window). Noise and crashes reuse the worker aggregates the map
 * already has, so turning them on costs nothing extra.
 */
export function useSourceCounts(params: {
  enabled: string[];
  windowId: WindowId;
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
}): SourceCountsState {
  const { enabled, windowId, boundaries, noise, crashes } = params;
  const index = useMemo(() => (boundaries ? new NtaIndex(boundaries) : null), [boundaries]);
  const remote = enabled
    .map((id) => SOURCE_BY_ID[id])
    .filter((source) => source && source.kind !== "builtin");

  const results = useQueries({
    queries: remote.map((source) => ({
      queryKey: [
        "source-counts",
        source.id,
        source.dateField ? windowId : "static",
      ],
      enabled: index !== null,
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!index) throw new Error("Neighborhood boundaries are not loaded yet.");
        return fetchSourceCounts(source, windowBounds(windowId), index, signal);
      },
    })),
  });

  const resultsKey = results
    .map((r) => `${r.status}:${r.dataUpdatedAt}:${r.errorUpdatedAt}`)
    .join("|");
  const enabledKey = enabled.join(",");
  const latest = { results, remote, enabled };

  return useMemo(() => {
    const { results, remote, enabled } = latest;
    const counts: Record<string, SourceCounts | undefined> = {};
    const status: Record<string, SourceStatus> = {};
    remote.forEach((source, i) => {
      const result = results[i];
      counts[source.id] = result?.data;
      status[source.id] = {
        isLoading: result?.isPending ?? true,
        error: result?.error ? result.error.message : null,
      };
    });
    if (enabled.includes("noise")) {
      counts.noise = noise ? countsFromAggregate("noise", noise) : undefined;
      status.noise = { isLoading: !noise, error: null };
    }
    if (enabled.includes("crashes")) {
      counts.crashes = crashes ? countsFromAggregate("crashes", crashes) : undefined;
      status.crashes = { isLoading: !crashes, error: null };
    }
    return { counts, status };
    // `results` is a new array every render; key the memo on what it holds.
  }, [resultsKey, enabledKey, noise, crashes]);
}
