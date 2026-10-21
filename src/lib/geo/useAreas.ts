import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchDistrictBoundaries } from "@/lib/api/districts";
import { DATA_BACKEND, fetchOctoAreas } from "@/lib/datasets/backend";
import type { NtaBoundary } from "@/lib/api/nta";
import type { MapModel, MapScale } from "@/lib/layers";
import { buildAreas, type AreaDatum } from "./areas";

/** Areas at the chosen unit. District shapes load only when that unit is picked. */
export function useAreas(model: MapModel, boundaries: NtaBoundary[] | null, scale: MapScale): AreaDatum[] {
  const districts = useQuery({
    queryKey: ["district-boundaries"],
    queryFn: ({ signal }) =>
      DATA_BACKEND === "octo" ? fetchOctoAreas("cd", signal) : fetchDistrictBoundaries(signal),
    enabled: scale === "districts",
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  return useMemo(
    () => buildAreas({ scale, model, boundaries, districts: districts.data ?? null }),
    [scale, model, boundaries, districts.data],
  );
}
