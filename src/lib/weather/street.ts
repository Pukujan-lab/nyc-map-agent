/**
 * Street-level weather, pure: what falls from the sky and how hard (from the
 * WMO weather code and the forecast's precipitation rate), how grey the air
 * is (cloud cover, visibility), one plain recommendation for the hour, and
 * the coordinate coarsening every weather request goes through (about 1 km,
 * see docs/PRIVACY.md "More precision than needed"). Shared by the street
 * weather overlay, the trip summary and the server.
 */

export type PrecipType = "none" | "rain" | "snow" | "sleet";

export interface Precip {
  type: PrecipType;
  /** 0 = nothing, 1 = the heaviest we draw. */
  intensity: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** WMO 4677 code (as Open-Meteo reports it) to type and a code-only intensity guess. */
export function precipFromCode(code: number | null | undefined): Precip {
  switch (code) {
    case 51: return { type: "rain", intensity: 0.15 };
    case 53: return { type: "rain", intensity: 0.25 };
    case 55: return { type: "rain", intensity: 0.35 };
    case 56: return { type: "sleet", intensity: 0.25 };
    case 57: return { type: "sleet", intensity: 0.45 };
    case 61: return { type: "rain", intensity: 0.3 };
    case 63: return { type: "rain", intensity: 0.6 };
    case 65: return { type: "rain", intensity: 0.9 };
    case 66: return { type: "sleet", intensity: 0.4 };
    case 67: return { type: "sleet", intensity: 0.8 };
    case 71: return { type: "snow", intensity: 0.3 };
    case 73: return { type: "snow", intensity: 0.6 };
    case 75: return { type: "snow", intensity: 0.9 };
    case 77: return { type: "snow", intensity: 0.2 };
    case 80: return { type: "rain", intensity: 0.4 };
    case 81: return { type: "rain", intensity: 0.7 };
    case 82: return { type: "rain", intensity: 1 };
    case 85: return { type: "snow", intensity: 0.5 };
    case 86: return { type: "snow", intensity: 0.9 };
    case 95: return { type: "rain", intensity: 0.8 };
    case 96:
    case 99: return { type: "rain", intensity: 1 };
    default: return { type: "none", intensity: 0 };
  }
}

/**
 * Type from the code, intensity from the rate when the forecast has one.
 * Rain: ~8 mm/h (the "heavy" threshold) draws at full strength. Snow is
 * measured as melted water, so ~3 mm/h is already a heavy snowfall.
 * A rate with no precipitation code (it happens between hours) counts as
 * rain, or snow at or below freezing.
 */
export function precipitation(code: number | null | undefined, rateMmH?: number | null, tempC?: number | null): Precip {
  const fromCode = precipFromCode(code);
  const rate = rateMmH ?? 0;
  let type = fromCode.type;
  if (type === "none") {
    if (rate < 0.1) return fromCode;
    type = tempC != null && tempC <= 0 ? "snow" : "rain";
  }
  if (rateMmH == null || rate <= 0) return { type, intensity: fromCode.intensity || 0.2 };
  const full = type === "rain" ? 8 : type === "snow" ? 3 : 5;
  return { type, intensity: Math.max(0.1, clamp01(rate / full)) };
}

/** Overcast and fog strength (0 to 1) for the tint over the street. */
export function atmosphere(cloudCoverPct: number | null | undefined, visibilityM: number | null | undefined, code?: number | null): { overcast: number; fog: number } {
  const overcast = clamp01((cloudCoverPct ?? 0) / 100);
  let fog = visibilityM == null ? 0 : clamp01((5000 - visibilityM) / 4000);
  if (code === 45 || code === 48) fog = Math.max(fog, 0.7);
  return { overcast, fog };
}

/**
 * Round a coordinate to 0.01° (about 1.1 km north-south, 0.85 km east-west
 * in New York) before it leaves for a weather or alert service.
 */
export function coarsen(lat: number, lon: number): { lat: number; lon: number } {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { lat: r(lat), lon: r(lon) };
}

/** "YYYY-MM-DDTHH" in New York for a Date (the forecast's hour key). */
export function nyHour(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}

/**
 * Which forecast hour to show: the trip's departure hour when one is planned
 * and has not already passed, else now. Both are New York local strings.
 */
export function forecastHour(tripDepart: string | null | undefined, nowHour: string): string {
  const trip = tripDepart?.slice(0, 13);
  return trip && trip >= nowHour ? trip : nowHour;
}

/** One forecast hour, the shape the overlay and the rules read. */
export interface HourWeather {
  /** Local hour, "YYYY-MM-DDTHH:00" (America/New_York). */
  time: string;
  tempC: number;
  feelsLikeC: number | null;
  /** 0 to 100. */
  precipPct: number;
  /** Expected precipitation in the hour (mm, water equivalent). */
  precipMm: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  code: number | null;
  cloudPct: number | null;
  visibilityM: number | null;
}

/** km/h at which wind is worth mentioning, and at which an umbrella turns inside out. */
export const WIND_NOTE_KMH = 30;
export const WIND_STRONG_KMH = 45;

export interface Advice {
  text: string;
  kind: "ice" | "heat" | "snow" | "rain" | "cold" | "wind" | "fine";
}

const ICY = /ice|icy|freez|winter storm|blizzard|sleet/i;
const HEAT = /heat/i;

/**
 * One plain recommendation for the hour, most important first. Pure.
 * `alerts` are NWS headlines or event names active at the place.
 */
export function recommend(h: HourWeather, alerts: readonly string[] = []): Advice {
  const p = precipitation(h.code, h.precipMm, h.tempC);
  const feels = h.feelsLikeC ?? h.tempC;
  const wind = Math.max(h.windKmh ?? 0, h.gustKmh ?? 0);
  const likely = h.precipPct >= 40 || (h.precipMm ?? 0) >= 0.3 || p.type !== "none";
  if (alerts.some((a) => ICY.test(a)) || ((p.type === "sleet" || p.type === "snow") && likely && h.tempC <= 1)) {
    return { text: "Roads and sidewalks may be icy", kind: "ice" };
  }
  if (alerts.some((a) => HEAT.test(a)) || feels >= 32) return { text: "Hot out: carry water and find shade", kind: "heat" };
  if (likely && p.type === "snow") return { text: "Wear boots and a warm coat", kind: "snow" };
  if (likely) {
    return wind >= WIND_STRONG_KMH
      ? { text: "Wear a raincoat; too windy for an umbrella", kind: "rain" }
      : { text: "Take an umbrella", kind: "rain" };
  }
  if (feels <= 0) return { text: "Bundle up: hat and gloves", kind: "cold" };
  if (feels < 10) return { text: "Wear a warm coat", kind: "cold" };
  if (feels < 17) return { text: "Bring a jacket", kind: "cold" };
  if (wind >= WIND_STRONG_KMH) return { text: "Strong wind gusts", kind: "wind" };
  return { text: "No weather worries", kind: "fine" };
}

export const toF = (c: number) => Math.round((c * 9) / 5 + 32);

/** The short facts under the recommendation: feels-like, precipitation, wind if strong. */
export function headsUpFacts(h: HourWeather): string[] {
  const out = [`${toF(h.tempC)}°F${h.feelsLikeC != null && Math.abs(h.feelsLikeC - h.tempC) >= 1.5 ? `, feels ${toF(h.feelsLikeC)}°F` : ""}`];
  const p = precipitation(h.code, h.precipMm, h.tempC);
  const mm = h.precipMm ?? 0;
  if (h.precipPct > 0 || mm > 0) {
    const what = p.type === "none" ? "rain" : p.type;
    out.push(`${Math.round(h.precipPct)}% ${what}${mm >= 0.1 ? `, ${mm.toFixed(1)} mm` : ""}`);
  }
  const wind = Math.max(h.windKmh ?? 0, h.gustKmh ?? 0);
  if (wind >= WIND_NOTE_KMH) out.push(`Wind up to ${Math.round(wind / 1.609)} mph`);
  return out;
}
