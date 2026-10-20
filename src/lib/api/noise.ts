import { z } from "zod";

/** 311 Service Requests (NYC Open Data). */
export const NOISE_DATASET = "erm2-nwe9";

export const NOISE_FIELDS = [
  "latitude",
  "longitude",
  "complaint_type",
  "descriptor",
  "created_date",
  // The only per-house-number field in either dataset: "123 BROADWAY".
  "incident_address",
] as const;

export const NOISE_SELECT = NOISE_FIELDS.join(",");

export const NOISE_BASE_WHERE =
  "complaint_type like 'Noise%' AND latitude IS NOT NULL AND longitude IS NOT NULL";

/** Escapes a value for a single-quoted SoQL literal. */
export function escapeSoqlString(value: string): string {
  if (value.includes("'")) {
    throw new Error("Unsafe SoQL literal");
  }
  return value;
}

export function noiseWhere(startIso: string, endIso: string): string {
  return `${NOISE_BASE_WHERE} AND created_date > '${escapeSoqlString(
    startIso,
  )}' AND created_date < '${escapeSoqlString(endIso)}'`;
}

const coordinate = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return Number.NaN;
  return typeof value === "number" ? value : Number(value);
}, z.number().finite());

/**
 * One CSV row from `erm2-nwe9`. Malformed rows are dropped and counted by the
 * aggregator rather than crashing the whole load.
 */
export const noiseRowSchema = z.object({
  latitude: coordinate,
  longitude: coordinate,
  complaint_type: z.string().min(1),
  descriptor: z.string().optional().default("Unspecified"),
  created_date: z.string().min(19),
  incident_address: z.string().optional().default(""),
});

export type NoiseRow = z.infer<typeof noiseRowSchema>;

/** Latitude/longitude sanity bounds for the five boroughs. */
export function isInNyc(lat: number, lon: number): boolean {
  return lat > 40.3 && lat < 41.1 && lon > -74.4 && lon < -73.5;
}
