import { z } from "zod";

/**
 * Mapillary client access token.
 *
 * Deliberately browser-visible: the panorama viewer and the nearest-image
 * lookup both talk to the Mapillary Graph API from the client, so the token is
 * in the bundle. That is what client tokens are for — unlike
 * `INFERHUB_API_KEY`, this is not a server secret. Rotate it from the Mapillary
 * developer dashboard if it is abused.
 */
export const MAPILLARY_TOKEN = (
  import.meta.env.VITE_MAPILLARY_TOKEN ||
  import.meta.env.MAPILLARY_TOKEN ||
  ""
).trim();

/**
 * Search radii, nearest first. Coverage in the outer boroughs is patchy, so a
 * miss at street scale widens to the neighbourhood before giving up.
 */
export const SEARCH_RADII_METRES = [250, 750, 1500] as const;

export const hasMapillaryToken = MAPILLARY_TOKEN.length > 0;

const GRAPH_URL = "https://graph.mapillary.com/images";
const FIELDS =
  "id,captured_at,geometry,computed_geometry,is_pano,thumb_1024_url";

const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const imageSchema = z.object({
  id: z.string().min(1),
  captured_at: z.number().nullish(),
  geometry: pointSchema.nullish(),
  computed_geometry: pointSchema.nullish(),
  is_pano: z.boolean().nullish(),
  thumb_1024_url: z.string().nullish(),
});

const responseSchema = z.object({ data: z.array(imageSchema) });

export interface MapillaryImage {
  id: string;
  /** `YYYY-MM-DD` the photo was taken, when the API reported it. */
  capturedAt: string | null;
  lon: number;
  lat: number;
  isPano: boolean;
  thumbnailUrl: string | null;
  /** Straight-line distance from the requested point, in metres. */
  distance: number;
}

export interface LngLatPoint {
  lon: number;
  lat: number;
}

const METERS_PER_DEGREE = 111_320;

/**
 * Flat-earth distance. Over a few hundred metres the error against a haversine
 * is centimetres, and this keeps the join off the main thread's critical path.
 */
export function metresBetween(a: LngLatPoint, b: LngLatPoint): number {
  const meanLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const east = (b.lon - a.lon) * METERS_PER_DEGREE * Math.cos(meanLatRad);
  const north = (b.lat - a.lat) * METERS_PER_DEGREE;
  return Math.hypot(east, north);
}

/**
 * The nearest Mapillary photo to a point.
 *
 * MapillaryJS v4 dropped `moveCloseTo`, so the search is ours: ask the Graph
 * API for every image inside a bounding box around the block, then pick the
 * closest in JS. A block square is ~300 m across, so a 250 m radius reaches the
 * surrounding streets — which is where the photography usually is.
 */
export async function findNearestImage(
  origin: LngLatPoint,
  radiusMetres = 250,
): Promise<MapillaryImage | null> {
  if (!hasMapillaryToken) {
    throw new Error("No Mapillary access token configured.");
  }

  const latDelta = radiusMetres / METERS_PER_DEGREE;
  const lonDelta =
    radiusMetres /
    (METERS_PER_DEGREE *
      Math.max(Math.cos(origin.lat * (Math.PI / 180)), 0.01));

  const bbox = [
    origin.lon - lonDelta,
    origin.lat - latDelta,
    origin.lon + lonDelta,
    origin.lat + latDelta,
  ]
    .map((value) => value.toFixed(6))
    .join(",");

  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: FIELDS,
    bbox,
    // A wider box holds more photos; ask for enough that the nearest is in it.
    limit: radiusMetres > 500 ? "500" : "100",
  });

  const response = await fetch(`${GRAPH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Mapillary rejected the access token."
        : `Mapillary returned ${response.status}.`,
    );
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Unexpected Mapillary response shape.");
  }

  let nearest: MapillaryImage | null = null;
  for (const row of parsed.data.data) {
    const point = row.computed_geometry ?? row.geometry;
    if (!point) continue;

    const [lon, lat] = point.coordinates;
    const distance = metresBetween(origin, { lon, lat });
    if (distance > radiusMetres) continue;
    if (nearest && distance >= nearest.distance) continue;

    nearest = {
      id: row.id,
      capturedAt:
        typeof row.captured_at === "number"
          ? new Date(row.captured_at).toISOString().slice(0, 10)
          : null,
      lon,
      lat,
      isPano: row.is_pano ?? false,
      thumbnailUrl: row.thumb_1024_url ?? null,
      distance,
    };
  }

  return nearest;
}

/** Permalink to a photo on mapillary.com — used for attribution. */
export function mapillaryImageLink(imageId: string): string {
  return `https://www.mapillary.com/app/?image_key=${encodeURIComponent(imageId)}`;
}

/**
 * Nearest photo, widening the search through `SEARCH_RADII_METRES` until one
 * turns up. Reports the radius that hit so the sheet can say "nearest photo is
 * 640 m away" rather than silently showing another street.
 */
export async function findNearestImageWidening(
  origin: LngLatPoint,
  radii: readonly number[] = SEARCH_RADII_METRES,
): Promise<{ image: MapillaryImage | null; radius: number }> {
  let radius = radii[0] ?? 250;
  for (const r of radii) {
    radius = r;
    const image = await findNearestImage(origin, r);
    if (image) return { image, radius: r };
  }
  return { image: null, radius };
}
