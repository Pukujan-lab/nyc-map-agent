import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

/**
 * Walking directions from the public FOSSGIS OSRM instance (foot profile).
 *
 * Keyless and CORS-enabled, but it is a donated community server: its usage
 * policy (https://routing.openstreetmap.de/about.html) asks for low volume,
 * no bulk/heavy use, and a visible OSM attribution. One request per A→B pick
 * is well inside that. Point `VITE_OSRM_URL` at your own OSRM for real traffic.
 */
export const OSRM_FOOT_URL = (
  import.meta.env.VITE_OSRM_URL ?? "https://routing.openstreetmap.de/routed-foot"
).replace(/\/$/, "");

export interface LngLat {
  lon: number;
  lat: number;
}

export interface WalkingRoute {
  /** [lon, lat] vertices. */
  coordinates: Array<[number, number]>;
  distanceMeters: number;
  durationSeconds: number;
}

const responseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(z.tuple([z.number(), z.number()])),
        }),
      }),
    )
    .optional(),
});

export function routeUrl(a: LngLat, b: LngLat): string {
  const coords = `${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}`;
  const params = new URLSearchParams({ overview: "full", geometries: "geojson" });
  return `${OSRM_FOOT_URL}/route/v1/foot/${coords}?${params.toString()}`;
}

export async function fetchWalkingRoute(
  a: LngLat,
  b: LngLat,
  signal?: AbortSignal,
): Promise<WalkingRoute> {
  const response = await fetch(routeUrl(a, b), { signal });
  if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Unexpected routing response.");
  const route = parsed.data.routes?.[0];
  if (parsed.data.code !== "Ok" || !route) {
    throw new Error(parsed.data.message ?? "No walking route found between those points.");
  }
  return {
    coordinates: route.geometry.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

export function useWalkingRoute(a: LngLat | null, b: LngLat | null) {
  return useQuery({
    queryKey: ["walk-route", a?.lon, a?.lat, b?.lon, b?.lat],
    enabled: a !== null && b !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: ({ signal }) => fetchWalkingRoute(a as LngLat, b as LngLat, signal),
  });
}
