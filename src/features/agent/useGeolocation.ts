import { useCallback, useRef } from "react";

/** Browser geolocation, asked once on first use; null if denied or missing. */
export function useGeolocation() {
  const last = useRef<{ lon: number; lat: number } | null>(null);
  const get = useCallback(
    () =>
      new Promise<{ lon: number; lat: number } | null>((resolve) => {
        if (!("geolocation" in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve((last.current = { lon: p.coords.longitude, lat: p.coords.latitude })),
          () => resolve(last.current),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
        );
      }),
    [],
  );
  return get;
}
