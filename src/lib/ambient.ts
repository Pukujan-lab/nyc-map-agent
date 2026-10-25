import { useSyncExternalStore } from "react";

/**
 * Shared ambient state for the daylight, weather and hazards features (they
 * may not import each other, so they meet here). Settings persist in
 * localStorage; runtime fields are set by MapView (eco, walking) and by the
 * weather feature (live condition).
 */
export type LightingMode = "auto" | "day" | "night";
export type WeatherMode = "live" | "clear" | "off";
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow";

interface AmbientState {
  lighting: LightingMode;
  weatherMode: WeatherMode;
  eco: boolean;
  walking: boolean;
  /** Live condition (already resolved against weatherMode by the weather feature). */
  weather: WeatherKind;
  tempC: number | null;
  /** Departure ("YYYY-MM-DDTHH:mm", New York) of the trip on screen, set by the agent; street weather forecasts that hour. */
  tripDepart: string | null;
}

const KEY = "nma:ambient";

function load(): Pick<AmbientState, "lighting" | "weatherMode"> {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as Partial<AmbientState>;
    return {
      lighting: raw.lighting === "day" || raw.lighting === "night" ? raw.lighting : "auto",
      weatherMode: raw.weatherMode === "clear" || raw.weatherMode === "off" ? raw.weatherMode : "live",
    };
  } catch {
    return { lighting: "auto", weatherMode: "live" };
  }
}

let state: AmbientState = { ...load(), eco: false, walking: false, weather: "clear", tempC: null, tripDepart: null };
const listeners = new Set<() => void>();

export function getAmbient(): AmbientState {
  return state;
}

export function setAmbient(patch: Partial<AmbientState>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as Array<keyof AmbientState>).every((k) => next[k] === state[k])) return;
  state = next;
  if ("lighting" in patch || "weatherMode" in patch) {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ lighting: state.lighting, weatherMode: state.weatherMode }));
    } catch {
      /* private mode */
    }
  }
  listeners.forEach((l) => l());
}

export function subscribeAmbient(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAmbient(): AmbientState {
  return useSyncExternalStore(subscribeAmbient, getAmbient, getAmbient);
}
