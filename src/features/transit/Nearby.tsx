import { useEffect, useState } from "react";
import { onMapInstance } from "@/lib/map/mapInstance";
import { usePanel } from "@/lib/store/PanelContext";
import { StationDetails } from "./TransitCard";
import { useNow, useTransitData, useTransitToggles } from "./hooks";
import { arrivalsAt, minutesUntil, SYSTEM_LABELS, type SystemId } from "./model";

/** Stations within this many metres of the map centre count as nearby. */
const RADIUS_M = 1000;
const LIMIT = 3;

function useMapCenter(): [number, number] | null {
  const [center, setCenter] = useState<[number, number] | null>(null);
  useEffect(() => {
    let off: (() => void) | null = null;
    const stop = onMapInstance((map) => {
      off?.();
      off = null;
      if (!map) return;
      const read = () => {
        const c = map.getCenter();
        setCenter([c.lng, c.lat]);
      };
      read();
      map.on("moveend", read);
      off = () => map.off("moveend", read);
    });
    return () => {
      off?.();
      stop();
    };
  }, []);
  return center;
}

const metres = (a: [number, number], b: [number, number]) => {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 111_320);
};

/** Home-panel list: the closest subway stations and their next trains. */
export default function Nearby() {
  const { on } = useTransitToggles();
  const systems = (["subway"] as SystemId[]).filter((s) => on.has(s));
  const data = useTransitData(systems);
  const now = useNow();
  const center = useMapCenter();
  const { showPanel } = usePanel();
  if (!systems.length || !center) return null;
  const stations = systems.flatMap((system) =>
    (data[system]?.stat?.stations.features ?? []).map((f) => ({
      system,
      id: String(f.properties.id),
      name: f.properties.name,
      d: metres(center, f.geometry.coordinates as [number, number]),
    })),
  )
    .filter((s) => s.d <= RADIUS_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, LIMIT);
  return (
    <section aria-label="Nearby arrivals" className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearby</div>
      {stations.length === 0 ? (
        <p className="text-xs text-muted-foreground">No stations within 1 km of the map centre.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {stations.map((s) => {
            const rows = arrivalsAt(s.system, data[s.system]?.live, s.id, now).slice(0, 3);
            return (
              <li key={`${s.system}:${s.id}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    showPanel({
                      id: `transit:station:${s.system}:${s.id}`,
                      title: s.name,
                      subtitle: `${SYSTEM_LABELS[s.system]} station`,
                      details: <StationDetails system={s.system} id={s.id} />,
                    })
                  }
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{Math.round(s.d)} m</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {rows.length
                      ? rows.map((a) => `${a.route} ${a.direction} ${minutesUntil(a.times[0], now)} min`).join(" · ")
                      : "No live arrivals right now"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
