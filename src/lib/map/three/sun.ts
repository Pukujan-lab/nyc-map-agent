import { useSyncExternalStore } from "react";
import SunCalc from "suncalc";

/**
 * Sun for the shadow layer (no three.js here): real NYC position from suncalc
 * for "now", or for `?time=HH:MM` (and optional `?date=YYYY-MM-DD`) in New York
 * local time, for testing. Also holds the Shadows setting and the moving
 * shadow casters (trains, buses) the vehicle layer reports.
 */
const NYC = { lat: 40.7549, lon: -73.984 };
const TZ = "America/New_York";

/** Offset of New York from UTC (minutes) at a given instant. */
function nyOffsetMin(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Pure: the instant for a `?time=`/`?date=` override, or null when absent or malformed. */
export function parseSunOverride(search: string, now = new Date()): Date | null {
  const q = new URLSearchParams(search);
  const t = /^(\d{1,2}):(\d{2})$/.exec(q.get("time") ?? "");
  if (!t || +t[1] > 23 || +t[2] > 59) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get("date") ?? "");
  let y: number, m: number, day: number;
  if (d) [y, m, day] = [+d[1], +d[2], +d[3]];
  else {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now).split("-");
    [y, m, day] = [+p[0], +p[1], +p[2]];
  }
  const guess = Date.UTC(y, m - 1, day, +t[1], +t[2]);
  // Two passes settle the DST offset for that local wall time.
  let at = new Date(guess - nyOffsetMin(new Date(guess)) * 60000);
  at = new Date(guess - nyOffsetMin(at) * 60000);
  return at;
}

/** The clock the sun follows: the URL override if any, else now. */
export function sunDate(): Date {
  const loc = typeof location === "undefined" ? null : location;
  return (loc && parseSunOverride(loc.search)) || new Date();
}

interface SunLight {
  altitudeDeg: number;
  azimuthDeg: number;
  /** Unit vector towards the sun in scene metres: x east, y up, z south. */
  dir: [number, number, number];
  /** Light colour, warm near the horizon. */
  color: [number, number, number];
  /** 0..1 shadow strength: 0 below the horizon, full above ~12°. */
  strength: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Pure: sun light for an instant. Weather softens shadows (cloud, fog, rain, snow). */
export function sunLight(at: Date, weather = "clear"): SunLight {
  const pos = SunCalc.getPosition(at, NYC.lat, NYC.lon);
  const alt = pos.altitude;
  // suncalc azimuth: from south, clockwise towards west.
  const az = pos.azimuth;
  const ce = Math.cos(alt);
  const dir: [number, number, number] = [-Math.sin(az) * ce, Math.sin(alt), Math.cos(az) * ce];
  const altitudeDeg = (alt * 180) / Math.PI;
  const azimuthDeg = ((az * 180) / Math.PI + 180) % 360;
  const golden = 1 - smooth(2, 20, altitudeDeg);
  const color: [number, number, number] = [1, 1 - 0.28 * golden, 1 - 0.55 * golden];
  const cloud = weather === "clear" ? 1 : weather === "fog" ? 0.25 : weather === "cloudy" ? 0.45 : 0.35;
  const strength = smooth(-0.5, 12, altitudeDeg) * cloud;
  return { altitudeDeg, azimuthDeg, dir, color, strength };
}

// ---- Shadows setting (default on for desktop, off on mobile / low-end) ----

const KEY = "nyc-map:shadows";
export function lowEnd(): boolean {
  if (typeof navigator === "undefined") return false;
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return coarse || cores <= 4 || mem <= 4;
}
function loadShadows(): boolean {
  const v = globalThis.localStorage?.getItem(KEY);
  return v === "1" ? true : v === "0" ? false : !lowEnd();
}
let shadowsOn: boolean | null = null;
const subs = new Set<() => void>();
export function getShadows(): boolean {
  if (shadowsOn === null) shadowsOn = loadShadows();
  return shadowsOn;
}
export function setShadows(on: boolean): void {
  shadowsOn = on;
  try {
    globalThis.localStorage?.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  for (const cb of subs) cb();
}
function subscribeShadows(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function useShadows(): boolean {
  return useSyncExternalStore(subscribeShadows, getShadows, () => false);
}

// ---- Moving casters (reported by the vehicle layer) ----

interface Caster {
  lon: number;
  lat: number;
  /** Heading, degrees clockwise from north. */
  bearing: number;
  length: number;
  width: number;
  height: number;
  /** Base above ground (elevated trains), metres. */
  z: number;
}
let casters: Caster[] = [];
export function setShadowCasters(list: Caster[]): void {
  casters = list;
}
export function getShadowCasters(): Caster[] {
  return casters;
}
