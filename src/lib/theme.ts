import { useSyncExternalStore } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Layout A themes (#171): Ivory (default), Ink and MTA muted are near-monochrome
 * with one accent; Neon is the optional deep-indigo theme with violet and pink. Interface colours
 * are CSS variables in index.css (`html.theme-<id>`); the map colours below
 * repaint the basemap's own background, water and park layers to match.
 */
export const THEMES = {
  ivory: { label: "Ivory", land: "#F2F1ED", water: "#CFE0EE", park: "#DCEFE3", street: "#FFFFFF", major: "#FBFBF9", label_: "#8a8f98", building: "#EAE8E2", bus: "#5F6B7A", busExpress: "#7A6A5C", dark: false },
  ink: { label: "Ink", land: "#141414", water: "#1D2523", park: "#1C2620", street: "#2A2A29", major: "#333331", label_: "#8a8883", building: "#1B1B1A", bus: "#8C96A3", busExpress: "#A3927F", dark: true },
  mta: { label: "MTA muted", land: "#F4F4F2", water: "#D9ECE4", park: "#D9EAD2", street: "#FFFFFF", major: "#FAFAFA", label_: "#7d7d7d", building: "#ECECE9", bus: "#4E6E91", busExpress: "#7C6A8E", dark: false },
  neon: { label: "Neon", land: "#0B0919", water: "#111A2C", park: "#10241E", street: "#1F1A3A", major: "#2A2350", label_: "#A49CC9", building: "#13102A", bus: "#8B7FD1", busExpress: "#C46FA8", dark: true },
} as const;
export type ThemeId = keyof typeof THEMES;
export const THEME_KEY = "nma.theme";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(THEMES, v);
}

export function readTheme(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ThemeId {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isThemeId(v) ? v : "ivory";
  } catch {
    return "ivory";
  }
}

function applyDocument(id: ThemeId): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const t of Object.keys(THEMES)) el.classList.remove(`theme-${t}`);
  el.classList.add(`theme-${id}`);
  el.classList.toggle("dark", THEMES[id].dark);
}

let theme: ThemeId = readTheme();
applyDocument(theme);
const listeners = new Set<() => void>();

export function setTheme(id: ThemeId): void {
  theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* private mode */
  }
  applyDocument(id);
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => theme, () => theme);
}

type Layer = { id: string; type: string; "source-layer"?: string };

/** Which basemap colour a layer takes in a theme, or null. Pure, for tests. */
export function themeTarget(l: Layer): { prop: "background-color" | "fill-color"; key: "land" | "water" | "park" } | null {
  if (l.type === "background") return { prop: "background-color", key: "land" };
  if (l.type !== "fill") return null;
  if (l["source-layer"] === "water") return { prop: "fill-color", key: "water" };
  if (l["source-layer"] === "park" || /^(park|landuse_park|landcover_grass|landcover_wood)/.test(l.id)) return { prop: "fill-color", key: "park" };
  if (l["source-layer"] === "landuse" || l["source-layer"] === "landcover") return { prop: "fill-color", key: "land" };
  return null;
}

export function applyMapTheme(map: MapLibreMap, id: ThemeId): void {
  const t = THEMES[id];
  for (const l of (map.getStyle()?.layers ?? []) as Layer[]) {
    const target = themeTarget(l);
    if (target) map.setPaintProperty(l.id, target.prop, t[target.key]);
  }
}
