import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const Hazards = z.object({
  mock: z.boolean().optional(),
  alerts: z.array(
    z.object({
      id: z.string(),
      event: z.string(),
      headline: z.string(),
      severity: z.string(),
      ends: z.string().nullable(),
      geometry: z.unknown().nullable(),
    }),
  ),
  sensors: z.array(z.object({ id: z.string(), name: z.string(), lon: z.number(), lat: z.number(), depthMm: z.number() })),
});
export type HazardsData = z.infer<typeof Hazards>;

/** `?hazards=mock` shows the sample feed (QA / demos when nothing is active). */
export function hazardsUrl(): string {
  const mock = new URLSearchParams(location.search).get("hazards") === "mock";
  return `/api/hazards${mock ? "?mock=1" : ""}`;
}

export async function fetchHazards(): Promise<HazardsData> {
  const res = await fetch(hazardsUrl());
  if (!res.ok) throw new Error(`Hazards feed returned ${res.status}.`);
  return Hazards.parse(await res.json());
}

export function useHazards() {
  return useQuery({ queryKey: ["hazards", hazardsUrl()], queryFn: fetchHazards, refetchInterval: 5 * 60_000, staleTime: 4 * 60_000 });
}
