import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { LngLat } from "@/lib/api/routing";

/** NYC Planning GeoSearch (Pelias) — keyless, CORS-enabled, NYC addresses only. */
const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/autocomplete";

export interface AddressHit extends LngLat {
  id: string;
  label: string;
}

const schema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({ id: z.string().optional(), gid: z.string().optional(), label: z.string() }),
    }),
  ),
});

export async function fetchAddressSuggestions(text: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const response = await fetch(`${GEOSEARCH_URL}?${new URLSearchParams({ text }).toString()}`, { signal });
  if (!response.ok) throw new Error(`Address search returned ${response.status}.`);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.features.flatMap((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const key = `${lon},${lat}`;
    if (seen.has(key)) return []; // GeoSearch returns aliases (B'WAY) at the same point
    seen.add(key);
    return [{ id: f.properties.gid ?? f.properties.id ?? key, label: f.properties.label.replace(/, USA$/, ""), lon, lat }];
  });
}

export function useAddressSuggestions(text: string) {
  const q = text.trim();
  return useQuery({
    queryKey: ["geosearch", q],
    enabled: q.length >= 3,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchAddressSuggestions(q, signal),
  });
}
