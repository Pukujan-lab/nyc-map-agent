import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { lookupFrom, type SegmentLookup, type SegmentRow } from "./history";
import { RAIL_SYSTEMS, type Bus, type LiveSystem, type StaticSystem, type SystemId , type XrayStation } from "./model";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const REFRESH = 15_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export type TransitLayerId = SystemId | "bus";

/** Live subway and buses are on when the URL says nothing (the default view). */
const DEFAULT_TRANSIT = "subway,bus";
const parseTransit = (raw: string | null) =>
  new Set((raw ?? DEFAULT_TRANSIT).split(",").filter((id) => id && id !== "none"));

/**
 * `?transit=subway,lirr` in the URL (absent = subway + buses, `none` = off);
 * `?transitPanel=1` opens the status drawer.
 */
export function useTransitToggles() {
  const [params, setParams] = useSearchParams();
  const on = parseTransit(params.get("transit")) as Set<TransitLayerId>;
  const set = useCallback(
    (id: TransitLayerId, value: boolean) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const cur = parseTransit(next.get("transit"));
        if (value) cur.add(id); else cur.delete(id);
        const joined = cur.size ? [...cur].join(",") : "none";
        if (joined === DEFAULT_TRANSIT) next.delete("transit"); else next.set("transit", joined);
        return next;
      }, { replace: true }),
    [setParams],
  );
  const panelOpen = params.get("transitPanel") === "1";
  const setPanelOpen = useCallback(
    (open: boolean) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set("transitPanel", "1"); else next.delete("transitPanel");
        return next;
      }, { replace: true }),
    [setParams],
  );
  return { on, set, panelOpen, setPanelOpen };
}

export function useTransitMeta() {
  return useQuery({ queryKey: ["transit", "meta"], queryFn: () => getJson<{ bus: boolean }>(`${API_BASE}/api/transit`), staleTime: 5 * 60_000, retry: 1 });
}

export function useTransitData(systems: SystemId[]) {
  const statics = useQueries({
    queries: RAIL_SYSTEMS.map((s) => ({
      queryKey: ["transit", "static", s],
      queryFn: () => getJson<StaticSystem>(`/transit/${s}.json`),
      staleTime: Infinity,
      enabled: systems.includes(s),
    })),
  });
  const live = useQueries({
    queries: RAIL_SYSTEMS.map((s) => ({
      queryKey: ["transit", "live", s],
      queryFn: () => getJson<LiveSystem>(`${API_BASE}/api/transit/${s}`),
      refetchInterval: REFRESH,
      enabled: systems.includes(s),
    })),
  });
  const out: Partial<Record<SystemId, { stat?: StaticSystem; live?: LiveSystem }>> = {};
  RAIL_SYSTEMS.forEach((s, i) => {
    if (systems.includes(s)) out[s] = { stat: statics[i].data, live: live[i].data };
  });
  return out;
}

export function useBuses(enabled: boolean) {
  return useQuery({
    queryKey: ["transit", "bus"],
    queryFn: () => getJson<{ at: number; buses: Bus[] }>(`${API_BASE}/api/transit/bus`),
    refetchInterval: REFRESH,
    enabled,
    retry: false,
  });
}

export type BusCall = { id: string; name: string; eta: number | null; away: string };
export type BusTrip = { found: boolean; route?: string; destination?: string; dir?: string; calls?: BusCall[] };
export type BusRoute = { route: string; lines: Array<Array<[number, number]>>; stops: Array<{ id: string; name: string; lon: number; lat: number }> };
/** One bus's headsign and upcoming stops with ETAs (SIRI), while its sheet is open. */
export function useBusTrip(vehicle: string | undefined) {
  return useQuery({
    queryKey: ["transit", "bus-trip", vehicle],
    queryFn: () => getJson<BusTrip>(`${API_BASE}/api/transit/bus-trip?${new URLSearchParams({ vehicle: vehicle ?? "" })}`),
    refetchInterval: REFRESH,
    enabled: Boolean(vehicle),
    retry: false,
  });
}
/** A bus route's shape and stops, fetched on demand when the route is selected. */
export function useBusRoute(route: string | undefined) {
  return useQuery({
    queryKey: ["transit", "bus-route", route],
    queryFn: () => getJson<BusRoute>(`${API_BASE}/api/transit/bus-route?${new URLSearchParams({ route: route ?? "" })}`),
    staleTime: 6 * 3600_000,
    enabled: Boolean(route),
    retry: false,
  });
}
/** Routes with an active, unplanned delay or detour (not planned work or notices): these get the '!' badge. */
export function alertedRoutes(alerts: TransitAlert[] | undefined): Set<string> {
  return new Set((alerts ?? []).filter((a) => a.kind === "delay" || (a.reroute && a.kind !== "planned")).flatMap((a) => a.routes));
}
export type TransitAlert = { id: string; kind: "planned" | "delay" | "notice"; type: string; reroute: boolean; text: string; agency: string; routes: string[]; stops: string[] };
export type Outage = { id: string; station: string; routes: string[]; stops: string[]; equipment: "Elevator" | "Escalator"; serving: string; reason: string; since: string; back: string; ada: "yes" | "no" | "not-ada"; alternative: string };
export function useAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["transit", "alerts"],
    queryFn: () => getJson<{ at: number; alerts: TransitAlert[]; outages: Outage[] }>(`${API_BASE}/api/transit/alerts`),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Seconds clock that ticks every second, for countdowns between feed refreshes. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

// Starred stations ("subway:G22") and lines ("subway:G"), kept in localStorage.
const STAR_KEY = "nma.transit.starred";
const NOTIFY_KEY = "nma.transit.notify";
const listeners = new Set<() => void>();
const readStars = () => localStorage.getItem(STAR_KEY) ?? "[]";
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
export function useStarred() {
  const raw = useSyncExternalStore(subscribe, readStars);
  const notifyRaw = useSyncExternalStore(subscribe, () => localStorage.getItem(NOTIFY_KEY) ?? "0");
  const starred = JSON.parse(raw) as string[];
  const toggle = useCallback((key: string) => {
    const cur = JSON.parse(readStars()) as string[];
    localStorage.setItem(STAR_KEY, JSON.stringify(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    listeners.forEach((l) => l());
  }, []);
  const setNotify = useCallback((on: boolean) => {
    localStorage.setItem(NOTIFY_KEY, on ? "1" : "0");
    listeners.forEach((l) => l());
  }, []);
  return { starred, isStarred: (k: string) => starred.includes(k), toggle, notify: notifyRaw === "1", setNotify };
}

/** Baked station insides for the x-ray view (~60 kB gz), fetched the first time x-ray is opened. */
export function useXrayData(enabled: boolean) {
  return useQuery({ queryKey: ["transit", "xray"], queryFn: () => getJson<Record<string, XrayStation>>("/transit/xray.json"), staleTime: Infinity, enabled });
}

/** Historical subway segment times for the routes on the map (refetched each 10 min). */
export function useSegmentHistory(routes: string[]): SegmentLookup | undefined {
  const qs = useQueries({
    queries: routes.map((r) => ({
      queryKey: ["transit", "segments", r],
      queryFn: () => getJson<{ segments: SegmentRow[] }>(`${API_BASE}/api/transit-segments?${new URLSearchParams({ route: r })}`),
      staleTime: 10 * 60_000,
      refetchInterval: 10 * 60_000,
      retry: 0,
    })),
  });
  const key = qs.map((q) => q.dataUpdatedAt).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (qs.some((q) => q.data) ? lookupFrom(new Map(routes.map((r, i) => [r, qs[i].data?.segments ?? []]))) : undefined), [key]);
}
