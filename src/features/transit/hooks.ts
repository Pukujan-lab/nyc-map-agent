import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { RAIL_SYSTEMS, type Bus, type LiveSystem, type StaticSystem, type SystemId } from "./model";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const REFRESH = 15_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export type TransitLayerId = SystemId | "bus";

/** `?transit=subway,lirr` in the URL; `?transitPanel=1` opens the status drawer. */
export function useTransitToggles() {
  const [params, setParams] = useSearchParams();
  const on = new Set((params.get("transit") ?? "").split(",").filter(Boolean) as TransitLayerId[]);
  const set = useCallback(
    (id: TransitLayerId, value: boolean) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const cur = new Set((next.get("transit") ?? "").split(",").filter(Boolean));
        if (value) cur.add(id); else cur.delete(id);
        if (cur.size) next.set("transit", [...cur].join(",")); else next.delete("transit");
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
  const starred: string[] = JSON.parse(raw);
  const toggle = useCallback((key: string) => {
    const cur: string[] = JSON.parse(readStars());
    localStorage.setItem(STAR_KEY, JSON.stringify(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    listeners.forEach((l) => l());
  }, []);
  const setNotify = useCallback((on: boolean) => {
    localStorage.setItem(NOTIFY_KEY, on ? "1" : "0");
    listeners.forEach((l) => l());
  }, []);
  return { starred, isStarred: (k: string) => starred.includes(k), toggle, notify: notifyRaw === "1", setNotify };
}
