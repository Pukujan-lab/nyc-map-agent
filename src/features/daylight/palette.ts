import SunCalc from "suncalc";
import type { LightingMode, WeatherKind } from "@/lib/ambient";

/** Midtown; the sun is the same for the whole map at this scale. */
const NYC = { lat: 40.7549, lon: -73.984 };

export interface Sun {
  /** 0 = full day, ~0.5 = dusk/dawn, 1 = night. */
  night: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

/** Sun position for NYC from suncalc; night ramps from +6° (golden hour) to -6° (civil dusk). */
export function sunFor(date: Date, mode: LightingMode): Sun {
  const pos = SunCalc.getPosition(date, NYC.lat, NYC.lon);
  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  // suncalc azimuth is from south, clockwise to west; MapLibre wants from north.
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const auto = Math.min(1, Math.max(0, (6 - altitudeDeg) / 12));
  const night = mode === "day" ? 0 : mode === "night" ? 1 : auto;
  return { night, altitudeDeg, azimuthDeg };
}

export type Rgba = [number, number, number, number];

const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");

/** Parse any CSS colour through the canvas (no colour library needed). */
export function parseColor(css: string): Rgba | null {
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  const v = ctx.fillStyle;
  if (v.startsWith("#")) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])] : null;
}

export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3]];
}

export function css(c: Rgba): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${c[3]})`;
}

const hex = (h: string): Rgba => parseColor(h) ?? [0, 0, 0, 1];

/** Night targets per basemap layer category (Google-Maps-like dark city). */
export const NIGHT: Record<string, Rgba> = {
  water: hex("#0a1a33"),
  park: hex("#0f2219"),
  road: hex("#2b3549"),
  building: hex("#1a2232"),
  text: hex("#c9d3e6"),
  halo: hex("#0b1020"),
  land: hex("#0e1626"),
};
const DUSK_TINT = hex("#7a4f6e");
const GREY = hex("#8f949b");
const SNOW = hex("#f2f4f7");
const WET = hex("#2f3238");

type Category = keyof typeof NIGHT;

export function categoryOf(id: string, type: string, prop: string): Category {
  if (prop === "text-color") return "text";
  if (prop === "text-halo-color") return "halo";
  if (/water|ocean|river/.test(id)) return "water";
  if (/park|grass|wood|forest|landcover|green|cemetery/.test(id)) return "park";
  if (type === "fill-extrusion" || /building/.test(id)) return "building";
  if (type === "line" && /road|highway|street|transport|bridge|tunnel|motorway|rail|path/.test(id)) return "road";
  return "land";
}

/** Day colour → the colour for this sun + weather. */
export function shade(day: Rgba, cat: Category, sun: Sun, weather: WeatherKind): Rgba {
  let c = day;
  if (weather === "cloudy" || weather === "rain" || weather === "fog") c = mix(c, mix(c, GREY, 0.5), 0.35);
  if (weather === "rain" && cat === "road") c = mix(c, WET, 0.45);
  if (weather === "snow" && (cat === "land" || cat === "park" || cat === "building")) c = mix(c, SNOW, 0.35);
  const dusk = 1 - Math.abs(2 * sun.night - 1);
  c = mix(c, DUSK_TINT, 0.18 * dusk);
  return mix(c, NIGHT[cat], sun.night * (cat === "text" || cat === "halo" ? 1 : 0.88));
}

const SKY = {
  day: { sky: hex("#a9c7ea"), horizon: hex("#eaf2fb") },
  dusk: { sky: hex("#2f3a6b"), horizon: hex("#f29a6a") },
  night: { sky: hex("#050914"), horizon: hex("#1a2440") },
};

export function skyColors(sun: Sun, weather: WeatherKind): { sky: Rgba; horizon: Rgba } {
  const t = sun.night;
  const a = t < 0.5 ? SKY.day : SKY.dusk;
  const b = t < 0.5 ? SKY.dusk : SKY.night;
  const k = t < 0.5 ? t * 2 : t * 2 - 1;
  let sky = mix(a.sky, b.sky, k);
  let horizon = mix(a.horizon, b.horizon, k);
  if (weather !== "clear") {
    const g = weather === "fog" ? 0.75 : 0.5;
    sky = mix(sky, mix(GREY, NIGHT.land, t), g);
    horizon = mix(horizon, mix(GREY, NIGHT.land, t), g);
  }
  return { sky, horizon };
}
