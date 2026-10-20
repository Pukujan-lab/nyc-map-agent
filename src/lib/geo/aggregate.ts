import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { fetchNtaBoundaries, type NtaBoundary } from "@/lib/api/nta";
import {
  readCachedAggregate,
  writeCachedAggregate,
} from "@/lib/cache/aggregateCache";
import { windowBounds, type WindowId } from "@/lib/windows";
import type {
  AggregateResult,
  AggregateWorkerRequest,
  AggregateWorkerResponse,
  AggregationProgress,
  DatasetId,
} from "./types";

/**
 * Crash data lags about four months, so a 90-day window can legitimately contain
 * zero crashes. Crashes therefore always use the newest 12 months available, and
 * every surface that shows crash numbers names that window explicitly.
 */
export const CRASH_WINDOW: WindowId = "12mo";

export interface RunAggregationOptions {
  dataset: DatasetId;
  windowId: WindowId;
  boundaries: NtaBoundary[];
  onProgress?: (progress: AggregationProgress) => void;
  signal?: AbortSignal;
}

export function runAggregation({
  dataset,
  windowId,
  boundaries,
  onProgress,
  signal,
}: RunAggregationOptions): Promise<AggregateResult> {
  const cached = readCachedAggregate(dataset, windowId);
  if (cached) return Promise.resolve(cached);

  const bounds = windowBounds(windowId);

  return new Promise<AggregateResult>((resolve, reject) => {
    const worker = new Worker(new URL("./aggregate.worker.ts", import.meta.url), {
      type: "module",
    });

    function finish(): void {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    }

    function onAbort(): void {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal?.aborted) {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<AggregateWorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.({
          loaded: message.loaded,
          total: message.total,
          phase: message.phase,
        });
        return;
      }
      if (message.type === "error") {
        finish();
        reject(new Error(message.message));
        return;
      }
      finish();
      writeCachedAggregate(message.result);
      resolve(message.result);
    };

    worker.onerror = (event: ErrorEvent) => {
      finish();
      reject(new Error(event.message || "The aggregation worker crashed."));
    };

    const request: AggregateWorkerRequest = {
      dataset,
      windowId,
      windowStart: bounds.startIso,
      windowEnd: bounds.endIso,
      boundaries,
    };
    worker.postMessage(request);
  });
}

export interface MapData {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  progress: {
    noise: AggregationProgress | null;
    crashes: AggregationProgress | null;
  };
  retry: () => void;
}

export function useMapData(windowId: WindowId): MapData {
  const queryClient = useQueryClient();
  const [noiseProgress, setNoiseProgress] = useState<AggregationProgress | null>(
    null,
  );
  const [crashProgress, setCrashProgress] = useState<AggregationProgress | null>(
    null,
  );

  const boundariesQuery = useQuery({
    queryKey: ["nta-boundaries"],
    queryFn: ({ signal }) => fetchNtaBoundaries(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 2,
  });

  const boundaries = boundariesQuery.data ?? null;

  const noiseQuery = useQuery({
    queryKey: ["aggregate", "noise", windowId],
    enabled: boundaries !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!boundaries) {
        throw new Error("Neighborhood boundaries are not loaded yet.");
      }
      return runAggregation({
        dataset: "noise",
        windowId,
        boundaries,
        onProgress: setNoiseProgress,
        signal,
      });
    },
  });

  const crashQuery = useQuery({
    queryKey: ["aggregate", "crashes", CRASH_WINDOW],
    enabled: boundaries !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!boundaries) {
        throw new Error("Neighborhood boundaries are not loaded yet.");
      }
      return runAggregation({
        dataset: "crashes",
        windowId: CRASH_WINDOW,
        boundaries,
        onProgress: setCrashProgress,
        signal,
      });
    },
  });

  const noise = noiseQuery.data ?? null;
  const crashes = crashQuery.data ?? null;

  useEffect(() => {
    if (!noise) return;
    console.info(
      `[aggregate] noise ${noise.windowId}: ${noise.totalRows} rows, ${noise.unassignedCount} unassigned, ${(noise.blocks ?? []).length} blocks`,
    );
  }, [noise]);

  useEffect(() => {
    if (!crashes) return;
    console.info(
      `[aggregate] crashes ${crashes.windowId}: ${crashes.totalRows} rows, ${crashes.unassignedCount} unassigned, ${(crashes.blocks ?? []).length} blocks`,
    );
  }, [crashes]);

  useEffect(() => {
    const error =
      boundariesQuery.error ?? noiseQuery.error ?? crashQuery.error;
    if (error) console.error("[aggregate] failed", error);
  }, [boundariesQuery.error, noiseQuery.error, crashQuery.error]);

  const retry = useCallback(() => {
    setNoiseProgress(null);
    setCrashProgress(null);
    void queryClient.invalidateQueries({ queryKey: ["nta-boundaries"] });
    void queryClient.invalidateQueries({ queryKey: ["aggregate"] });
  }, [queryClient]);

  const firstError =
    boundariesQuery.error ?? noiseQuery.error ?? crashQuery.error;

  return {
    boundaries,
    noise,
    crashes,
    isLoading:
      boundariesQuery.isPending ||
      noiseQuery.isPending ||
      crashQuery.isPending,
    isError:
      boundariesQuery.isError || noiseQuery.isError || crashQuery.isError,
    error: firstError instanceof Error ? firstError : null,
    progress: { noise: noiseProgress, crashes: crashProgress },
    retry,
  };
}
