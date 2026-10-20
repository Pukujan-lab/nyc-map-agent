import { z } from "zod";
import { socrataRequest } from "./socrata";

/** 2020 Neighborhood Tabulation Areas. */
export const NTA_DATASET = "9nt8-h7nd";

export type Ring = Array<[number, number]>;
/** One polygon: [outerRing, ...holes] */
export type PolygonRings = Ring[];
export type Bbox = [number, number, number, number];

export interface NtaBoundary {
  ntaCode: string;
  ntaName: string;
  borough: string;
  bbox: Bbox;
  center: [number, number];
  polygons: PolygonRings[];
}

const geoJsonSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.record(z.unknown()),
      geometry: z
        .object({
          type: z.enum(["Polygon", "MultiPolygon"]),
          coordinates: z.array(z.unknown()),
        })
        .nullable(),
    }),
  ),
});

type RawProperties = Record<string, unknown>;

function pickString(properties: RawProperties, keys: string[]): string {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

function toRings(raw: unknown): PolygonRings {
  if (!Array.isArray(raw)) return [];
  const rings: PolygonRings = [];
  for (const ringRaw of raw) {
    if (!Array.isArray(ringRaw)) continue;
    const ring: Ring = [];
    for (const point of ringRaw) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lon = Number(point[0]);
      const lat = Number(point[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) ring.push([lon, lat]);
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function computeBbox(polygons: PolygonRings[]): Bbox {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function parseNtaBoundaries(payload: unknown): NtaBoundary[] {
  const parsed = geoJsonSchema.parse(payload);
  const boundaries: NtaBoundary[] = [];

  for (const feature of parsed.features) {
    if (!feature.geometry) continue;
    const properties = feature.properties;
    const ntaCode = pickString(properties, ["nta2020", "NTA2020", "nta_code"]);
    if (!ntaCode) continue;

    const coordinates = feature.geometry.coordinates;
    const polygons: PolygonRings[] =
      feature.geometry.type === "MultiPolygon"
        ? coordinates.map((polygon) => toRings(polygon))
        : [toRings(coordinates)];

    const usable = polygons.filter((polygon) => polygon.length > 0);
    if (usable.length === 0) continue;

    const bbox = computeBbox(usable);
    boundaries.push({
      ntaCode,
      ntaName:
        pickString(properties, ["ntaname", "NTANAME", "nta_name"]) || ntaCode,
      borough:
        pickString(properties, ["boroname", "BORONAME", "borough"]) ||
        "Unspecified",
      bbox,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      polygons: usable,
    });
  }

  boundaries.sort((a, b) => a.ntaCode.localeCompare(b.ntaCode));
  return boundaries;
}

export async function fetchNtaBoundaries(
  signal?: AbortSignal,
): Promise<NtaBoundary[]> {
  // The GeoJSON representation is the only one that returns a FeatureCollection;
  // the plain JSON representation flattens `the_geom` into a nested object.
  const response = await socrataRequest(
    NTA_DATASET,
    "geojson",
    { $limit: "400" },
    signal,
  );
  const payload = (await response.json()) as unknown;
  const boundaries = parseNtaBoundaries(payload);
  if (boundaries.length === 0) {
    throw new Error("Could not load neighborhood boundaries.");
  }
  return boundaries;
}

/** Great-circle distance in kilometers. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const radius = 6371;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const lat1 = aLat * toRad;
  const lat2 = bLat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}
