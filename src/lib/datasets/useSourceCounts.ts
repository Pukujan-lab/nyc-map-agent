import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import type { NtaBoundary } from "@/lib/api/nta";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import type { AggregateResult } from "@/lib/geo/types";
import { windowBounds, type WindowId } from "@/lib/windows";
import { countsFromAggregate, fetchSourceCounts, type SourceCounts } from "./fetchSource";
import { DATA_BACKEND, fetchOctoCounts, type DataFilters } from "./backend";
import { SOURCE_BY_ID, type SourceConfig } from "./registry";

const EMPTY_FILTERS: DataFilters = { categories: {}, severity: [] };

function isWindowed(source: SourceConfig): boolean {
  return source.kind === "builtin" || Boolean(source.dateField);
}

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
  /** Octo backend only: borough / category / severity filters. */
  filters?: DataFilters;
}): SourceCountsState {
  const { enabled, windowId, boundaries, noise, crashes } = params;
  const filters = params.filters ?? EMPTY_FILTERS;
  const octo = DATA_BACKEND === "octo";
  const index = useMemo(() => (boundaries ? new NtaIndex(boundaries) : null), [boundaries]);
  const remote = enabled
    .map((id) => SOURCE_BY_ID[id])
    .filter((source) => source && (octo || source.kind !== "builtin"));

  const results = useQueries({
    queries: remote.map((source) => ({
      queryKey: [
        "source-counts",
        source.id,
        isWindowed(source) ? windowId : "static",
        octo ? JSON.stringify(filters) : "socrata",
      ],
      enabled: index !== null,
      staleTime: 30 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      retry: 1,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!index) throw new Error("Neighborhood boundaries are not loaded yet.");
        if (octo) return fetchOctoCounts(source, windowId, filters, index, signal);
        if (source.kind === "builtin") throw new Error("Builtin sources come from the worker.");
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
    if (!octo && enabled.includes("noise")) {
      counts.noise = noise ? countsFromAggregate("noise", noise) : undefined;
      status.noise = { isLoading: !noise, error: null };
    }
    if (!octo && enabled.includes("crashes")) {
      counts.crashes = crashes ? countsFromAggregate("crashes", crashes) : undefined;
      status.crashes = { isLoading: !crashes, error: null };
    }
    return { counts, status };
    // `results` is a new array every render; key the memo on what it holds.
  }, [resultsKey, enabledKey, noise, crashes, octo]);
}
