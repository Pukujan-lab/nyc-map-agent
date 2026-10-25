import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";

const Rules = z.object({ rules: z.array(z.string()), meters: z.array(z.string()), signCount: z.number() });

/** Street parking rules within ~150 m of the picked place (DOT signs + meters). */
export function StreetRules({ lon, lat }: { lon: number; lat: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["parking-rules", lon.toFixed(4), lat.toFixed(4)],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/parking/rules", { params: { query: { lon: Number(lon.toFixed(5)), lat: Number(lat.toFixed(5)) } } });
      if (!data) throw new Error(`Parking rules returned ${response.status}.`);
      return Rules.parse(data);
    },
    staleTime: 3600_000,
  });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  if (isError || !data) return <p className="text-[11px] text-muted-foreground">Could not load parking rules.</p>;
  if (!data.rules.length && !data.meters.length) return <p className="text-[11px] text-muted-foreground">No posted parking rules found nearby.</p>;
  return (
    <div className="space-y-1.5 text-[11px]">
      <ul className="space-y-0.5">
        {data.rules.map((r) => (
          <li key={r} className="text-foreground">{r}</li>
        ))}
      </ul>
      {data.meters.length ? <div className="text-muted-foreground">Meters: {data.meters.join(" · ")}</div> : null}
      <div className="text-[10px] text-muted-foreground">NYC DOT parking signs and meters within ~150 m. Check the posted sign.</div>
    </div>
  );
}
