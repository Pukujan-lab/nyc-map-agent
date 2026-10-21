import type { NtaBoundary } from "./nta";
import { parseNtaBoundaries } from "./nta";
import { socrataRequest } from "./socrata";

/** NYC Open Data "Community Districts" (boro_cd = borough digit × 100 + district). */
export const DISTRICT_DATASET = "5crt-au7u";

const BOROUGH_BY_DIGIT: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
};

/**
 * Reuses the NTA parser (same polygon shape) by mapping boro_cd onto the code
 * field. Joint interest areas (district number above 18: parks, airports)
 * are dropped — they are not community districts.
 */
export function parseDistrictBoundaries(payload: unknown): NtaBoundary[] {
  const features = (payload as { features?: Array<{ properties?: Record<string, unknown> }> }).features ?? [];
  for (const f of features) {
    const cd = String(f.properties?.boro_cd ?? "");
    const borough = BOROUGH_BY_DIGIT[cd.charAt(0)] ?? "Unspecified";
    f.properties = {
      ...f.properties,
      nta2020: cd,
      ntaname: `${borough} CD ${Number(cd.slice(1))}`,
      boroname: borough,
    };
  }
  return parseNtaBoundaries(payload).filter((b) => Number(b.ntaCode.slice(1)) <= 18);
}

export async function fetchDistrictBoundaries(signal?: AbortSignal): Promise<NtaBoundary[]> {
  const response = await socrataRequest(DISTRICT_DATASET, "geojson", { $limit: "100" }, signal);
  return parseDistrictBoundaries(await response.json());
}
