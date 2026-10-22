/** One place as /api/v1/place-toilets serves it (server/features/place-toilets/schema.ts). */
export interface PlaceToiletProps {
  id: string;
  name: string;
  kind: string;
  access: "anyone" | "customers";
  accessTagged: boolean;
  wheelchair: boolean | null;
  changingTable: boolean | null;
  fee: boolean | null;
  source: "openstreetmap";
  url: string;
}
export type PlaceToiletFeature = GeoJSON.Feature<GeoJSON.Point, PlaceToiletProps>;

export const ACCESS_LABEL: Record<PlaceToiletProps["access"], string> = {
  anyone: "Anyone",
  customers: "Customers only",
};

export const KIND_LABEL: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Fast food",
  bar: "Bar",
  pub: "Pub",
  shop: "Shop",
};

/** Minimum zoom for these markers: public restrooms stay primary below it. */
export const MIN_ZOOM = 15;

let cache: Promise<PlaceToiletFeature[]> | null = null;

/** City-wide list, fetched once per page (≈1k points, cached by the CDN for an hour). */
export function fetchPlaceToilets(): Promise<PlaceToiletFeature[]> {
  cache ??= fetch("/api/v1/place-toilets")
    .then((r) => (r.ok ? (r.json() as Promise<{ features?: PlaceToiletFeature[] }>) : { features: [] }))
    .then((b) => b.features ?? [])
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}
