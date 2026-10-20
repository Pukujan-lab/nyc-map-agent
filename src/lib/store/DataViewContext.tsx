import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_ENABLED_SOURCES,
  parseSourceList,
} from "@/lib/datasets/registry";
import { parseViewMode, viewModeToParam, type ViewMode } from "@/lib/datasets/view";
import type { LngLat } from "@/lib/api/routing";

export type RoutePickTarget = "start" | "end";

interface DataViewValue {
  /** Sources that are fetched (data-sources drawer toggles). URL `sources`. */
  enabledSources: string[];
  /** Sources that feed the Average view. URL `avg`. */
  averageSources: string[];
  viewMode: ViewMode;
  setSourceEnabled: (id: string, enabled: boolean) => void;
  setInAverage: (id: string, included: boolean) => void;
  setViewMode: (mode: ViewMode) => void;

  /** Walking directions, A → B. */
  routeStart: LngLat | null;
  routeEnd: LngLat | null;
  /** Next map click sets this endpoint instead of selecting an area. */
  routePicking: RoutePickTarget | null;
  setRoutePicking: (target: RoutePickTarget | null) => void;
  setRoutePoint: (target: RoutePickTarget, point: LngLat | null) => void;
  clearRoute: () => void;
  /** True while the street camera follows the route. */
  followingRoute: boolean;
  setFollowingRoute: (following: boolean) => void;
}

const DataViewContext = createContext<DataViewValue | null>(null);

export function DataViewProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourcesParam = searchParams.get("sources");
  const avgParam = searchParams.get("avg");
  const viewParam = searchParams.get("view");

  const enabledSources = useMemo(
    () => parseSourceList(sourcesParam, DEFAULT_ENABLED_SOURCES),
    [sourcesParam],
  );
  const averageSources = useMemo(
    () =>
      parseSourceList(avgParam, enabledSources).filter((id) =>
        enabledSources.includes(id),
      ),
    [avgParam, enabledSources],
  );
  const viewMode = useMemo(() => {
    const mode = parseViewMode(viewParam, averageSources);
    // A single-source view of a source that is switched off shows nothing.
    if (mode.kind === "source" && !enabledSources.includes(mode.sourceId)) {
      return { kind: "legacy" } as const;
    }
    return mode;
  }, [viewParam, averageSources, enabledSources]);

  const update = useCallback(
    (patch: Record<string, string>) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const setSourceEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const next = enabled
        ? Array.from(new Set([...enabledSources, id]))
        : enabledSources.filter((s) => s !== id);
      const avg = enabled
        ? Array.from(new Set([...averageSources, id]))
        : averageSources.filter((s) => s !== id);
      update({ sources: next.join(","), avg: avg.join(",") });
    },
    [enabledSources, averageSources, update],
  );

  const setInAverage = useCallback(
    (id: string, included: boolean) => {
      const avg = included
        ? Array.from(new Set([...averageSources, id]))
        : averageSources.filter((s) => s !== id);
      update({ avg: avg.join(",") });
    },
    [averageSources, update],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => update({ view: viewModeToParam(mode) }),
    [update],
  );

  const [routeStart, setRouteStart] = useState<LngLat | null>(null);
  const [routeEnd, setRouteEnd] = useState<LngLat | null>(null);
  const [routePicking, setRoutePicking] = useState<RoutePickTarget | null>(null);
  const [followingRoute, setFollowingRoute] = useState(false);

  const setRoutePoint = useCallback((target: RoutePickTarget, point: LngLat | null) => {
    if (target === "start") setRouteStart(point);
    else setRouteEnd(point);
    setRoutePicking(null);
    setFollowingRoute(false);
  }, []);

  const clearRoute = useCallback(() => {
    setRouteStart(null);
    setRouteEnd(null);
    setRoutePicking(null);
    setFollowingRoute(false);
  }, []);

  const value = useMemo<DataViewValue>(
    () => ({
      enabledSources,
      averageSources,
      viewMode,
      setSourceEnabled,
      setInAverage,
      setViewMode,
      routeStart,
      routeEnd,
      routePicking,
      setRoutePicking,
      setRoutePoint,
      clearRoute,
      followingRoute,
      setFollowingRoute,
    }),
    [
      enabledSources,
      averageSources,
      viewMode,
      setSourceEnabled,
      setInAverage,
      setViewMode,
      routeStart,
      routeEnd,
      routePicking,
      setRoutePoint,
      clearRoute,
      followingRoute,
    ],
  );

  return <DataViewContext.Provider value={value}>{children}</DataViewContext.Provider>;
}

export function useDataView(): DataViewValue {
  const context = useContext(DataViewContext);
  if (!context) throw new Error("useDataView must be used inside DataViewProvider");
  return context;
}
