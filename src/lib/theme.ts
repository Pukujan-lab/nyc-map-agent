import { useSyncExternalStore } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import SunCalc from "suncalc";
import { parseSunOverride } from "@/lib/map/three/sun";

/**
 * Layout A themes (#171): Ivory (default), Ink and MTA muted are near-monochrome
 * with one accent; Neon is the optional deep-indigo theme with violet and pink. Interface colours
 * are CSS variables in index.css (`html.theme-<id>`); the map colours below
 * repaint the basemap's own background, water and park layers to match.
 */
export const THEMES = {
  ivory: { label: "Ivory", land: "#F2F1ED", water: "#CFE0EE", park: "#DCEFE3", street: "#FFFFFF", major: "#FBFBF9", label_: "#8a8f98", building: "#DCD8CD", bus: "#5F6B7A", busExpress: "#7A6A5C", dark: false },
  ink: { label: "Ink", land: "#141414", water: "#1D2523", park: "#1C2620", street: "#2A2A29", major: "#333331", label_: "#8a8883", building: "#2F2F2D", bus: "#8C96A3", busExpress: "#A3927F", dark: true },
  mta: { label: "MTA muted", land: "#F4F4F2", water: "#D9ECE4", park: "#D9EAD2", street: "#FFFFFF", major: "#FAFAFA", label_: "#7d7d7d", building: "#DCDCD6", bus: "#4E6E91", busExpress: "#7C6A8E", dark: false },
  neon: { label: "Neon", land: "#221D4A", water: "#1B2550", park: "#1E3A3A", street: "#3B3475", major: "#4A4290", label_: "#D4CEF5", building: "#352E6E", bus: "#8B7FD1", busExpress: "#C46FA8", dark: true },
} as const;
export type ThemeId = keyof typeof THEMES;
export type Palette = { label: string; land: string; water: string; park: string; street: string; major: string; label_: string; building: string; bus: string; busExpress: string; dark: boolean };

/**
 * Auto (time of day, the default): Ivory by day, a warm Dusk for ~45 min either
 * side of sunset / sunrise, and a lighter, bluer Night (Google-Maps-night-nav-like).
 * Sun times come from suncalc, on the device, for NYC or the shared location; no network.
 */
export const DUSK: Palette = { label: "Dusk", land: "#EDE3D6", water: "#B9C7D3", park: "#CFDCC8", street: "#F8F1E7", major: "#F4EADC", label_: "#7f746d", building: "#D0C3B1", bus: "#6A6470", busExpress: "#85705E", dark: false };
export const NIGHT: Palette = { label: "Night", land: "#1F2A36", water: "#142131", park: "#22392F", street: "#33424F", major: "#415264", label_: "#A9B8C8", building: "#2E3B4A", bus: "#A4B4C8", busExpress: "#C8AE92", dark: true };
export const DAY: Palette = THEMES.ivory;
export type ThemeChoice = ThemeId | "auto";
export const CHOICES: ThemeChoice[] = ["auto", "ivory", "ink", "mta", "neon"];
export const THEME_KEY = "nma.theme";
const NYC = { lat: 40.7128, lon: -74.006 };
const WINDOW_MS = 45 * 60_000;

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(THEMES, v);
}
export function isChoice(v: unknown): v is ThemeChoice {
  return v === "auto" || isThemeId(v);
}

export function readTheme(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ThemeChoice {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isChoice(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Linear mix of two #rrggbb colours. Pure. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hex(a), y = hex(b), k = Math.min(1, Math.max(0, t));
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** Footprint edge: the building tint pushed toward ink (light themes) or ivory (dark). Pure. */
export function buildingEdge(p: Pick<Palette, "building" | "dark">): string {
  return mixHex(p.building, p.dark ? "#F2F1ED" : "#1A1A1A", p.dark ? 0.14 : 0.2);
}
/** WCAG relative-luminance contrast ratio of two #rrggbb colours. Pure. */
export function contrastRatio(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = hex(c).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const out = { ...(t < 0.5 ? a : b) };
  for (const k of ["land", "water", "park", "street", "major", "label_", "building", "bus", "busExpress"] as const) out[k] = mixHex(a[k], b[k], t);
  return out;
}

export type Phase = "day" | "dusk" | "dawn" | "night";
/**
 * Where `now` sits in the day. Around sunset: day → dusk over the 45 min before,
 * dusk → night over the 45 min after (sunrise mirrors it as dawn). Pure.
 */
export function autoPalette(now: Date, at = NYC, stepped = false): { phase: Phase; palette: Palette; ui: "ivory" | "dusk" | "night" } {
  const sun = SunCalc.getTimes(now, at.lat, at.lon);
  const t = now.getTime();
  const near = (edge: Date) => (t - edge.getTime()) / WINDOW_MS; // -1..1 inside the window
  const s = near(sun.sunset), r = near(sun.sunrise);
  const ease = (x: number) => (stepped ? Math.round(x) : x);
  if (s >= -1 && s <= 1) {
    return s < 0
      ? { phase: "dusk", palette: mixPalette(DAY, DUSK, ease(s + 1)), ui: "dusk" }
      : { phase: "dusk", palette: mixPalette(DUSK, NIGHT, ease(s)), ui: s < 0.5 ? "dusk" : "night" };
  }
  if (r >= -1 && r <= 1) {
    return r < 0
      ? { phase: "dawn", palette: mixPalette(NIGHT, DUSK, ease(r + 1)), ui: r < -0.5 ? "night" : "dusk" }
      : { phase: "dawn", palette: mixPalette(DUSK, DAY, ease(r)), ui: "dusk" };
  }
  const day = t > sun.sunrise.getTime() && t < sun.sunset.getTime();
  return day ? { phase: "day", palette: DAY, ui: "ivory" } : { phase: "night", palette: NIGHT, ui: "night" };
}

/** QA clock: ?qaTime=2026-10-21T18:05 pins the Auto theme's time (screenshots only). */
function clock(): Date {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("qaTime");
    if (q && !Number.isNaN(Date.parse(q))) return new Date(q);
    const o = parseSunOverride(globalThis.location?.search ?? "");
    if (o) return o;
  } catch { /* no location */ }
  return new Date();
}
let coordsFn: () => { lat: number; lon: number } | null = () => null;
/** The shared location (client-side only) refines sun times; set by the app shell. */
export function setThemeCoords(fn: () => { lat: number; lon: number } | null): void { coordsFn = fn; }

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let choice: ThemeChoice = readTheme();
let state = resolve();
const listeners = new Set<() => void>();

function resolve(): { palette: Palette; ui: string; phase: Phase | null } {
  if (choice !== "auto") return { palette: THEMES[choice], ui: choice, phase: null };
  const a = autoPalette(clock(), coordsFn() ?? NYC, reducedMotion());
  return { palette: a.palette, ui: a.ui, phase: a.phase };
}

function applyDocument(ui: string, dark: boolean): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const t of [...Object.keys(THEMES), "dusk", "night"]) if (t !== ui) el.classList.remove(`theme-${t}`);
  el.classList.add(`theme-${ui}`);
  el.classList.toggle("dark", dark);
}
function refresh(): void {
  state = resolve();
  applyDocument(state.ui, state.palette.dark);
  listeners.forEach((l) => l());
}
applyDocument(state.ui, state.palette.dark);
// Auto: recompute every 3 minutes, so the map drifts through dusk without flashing.
if (typeof window !== "undefined") window.setInterval(() => { if (choice === "auto") refresh(); }, 3 * 60_000);

export function setTheme(id: ThemeChoice): void {
  choice = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* private mode */
  }
  refresh();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** Non-React access for map features (daylight): the current pick and its changes. */
export function getThemeChoice(): ThemeChoice { return choice; }
export function subscribeTheme(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
/** The user's pick: auto, ivory, ink, mta or neon. */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice, () => choice);
}
/** The colours in effect right now (Auto resolved for the time of day). */
export function usePalette(): Palette {
  return useSyncExternalStore(subscribe, () => state.palette, () => state.palette);
}
/** Auto's current phase for the picker label ("Auto · Dusk"), or null for a fixed theme. */
export function useAutoPhase(): Phase | null {
  return useSyncExternalStore(subscribe, () => state.phase, () => state.phase);
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

export function applyMapTheme(map: MapLibreMap, t: Palette): void {
  for (const l of (map.getStyle()?.layers ?? []) as Layer[]) {
    const target = themeTarget(l);
    if (target) map.setPaintProperty(l.id, target.prop, t[target.key]);
  }
}
