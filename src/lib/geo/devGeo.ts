/**
 * Development only: a fixed fake position (Elmhurst, Queens) so tests and
 * agents never trigger the real browser location prompt. Production builds
 * always use the real `navigator.geolocation`. Set VITE_FAKE_LOCATION to
 * "lon,lat" to move it, or to "off" to use the real location in development.
 */
import { simGeo, simRequested } from "./simWalk";

type Geo = Pick<Geolocation, "watchPosition" | "clearWatch">;

/** Near Queens Center, Elmhurst. */
export const ELMHURST = { lon: -73.8784, lat: 40.7389 };

export function fakeCoords(setting: string | undefined, dev: boolean): { lon: number; lat: number } | null {
  if (!dev || setting === "off") return null;
  if (!setting) return ELMHURST;
  const [lon, lat] = setting.split(",").map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : ELMHURST;
}

export function fakeGeo(coords: { lon: number; lat: number }): Geo {
  return {
    watchPosition: (ok) => {
      setTimeout(() => ok({ coords: { longitude: coords.lon, latitude: coords.lat, accuracy: 10, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() } as GeolocationPosition), 0);
      return 1;
    },
    clearWatch: () => {},
  };
}

let sim: Geo | null = null;

/** The geolocation the app should use: the pretend trip with `?sim=walk`, the fake one in development, the browser's otherwise. */
export function appGeo(): Geo | null {
  // One instance, so clearWatch finds the watch that watchPosition started.
  if (typeof window !== "undefined" && simRequested(window.location.search)) return (sim ??= simGeo());
  const fake = fakeCoords(import.meta.env.VITE_FAKE_LOCATION as string | undefined, import.meta.env.DEV && import.meta.env.MODE !== "test");
  if (fake) return fakeGeo(fake);
  return typeof navigator !== "undefined" && "geolocation" in navigator ? navigator.geolocation : null;
}
