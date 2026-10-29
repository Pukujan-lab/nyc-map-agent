import { useMemo } from "react";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { usePanel } from "@/lib/store/PanelContext";
import { heldTrains } from "@/lib/transit/holds";
import { setSelectedLine } from "@/lib/transit/selectedLine";
import { lineStatus, type LineStatus } from "./alertFocus";
import { useAlerts, useTransitData } from "./hooks";
import { allLineNotices } from "./lineNotices";
import { RouteBullet } from "./TransitCard";

/** Every subway service plus the shuttles and SIR, in MTA order. */
const DRAWER_LINES = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "GS", "FS", "H", "SI"];

const BADGE: Record<LineStatus, string> = {
  "Good service": "border-border text-muted-foreground",
  Delays: "border-foreground bg-foreground text-background",
  Detour: "border-[hsl(var(--acc))] bg-[hsl(var(--acc))] text-[hsl(var(--acc-foreground))]",
  "Planned work": "border-foreground text-foreground",
};

/** Lines drawer (#253): tap a row to open that line on the map with its notices. */
export function LinesDrawer() {
  const data = useTransitData(["subway"]);
  const feed = useAlerts(true).data;
  const alerts = useMemo(() => feed?.alerts ?? [], [feed]);
  const sys = data.subway?.stat;
  const live = data.subway?.live;
  // The same notices the line's sheet lists, so the count here matches it.
  const counts = useMemo(() => {
    const held = [...heldTrains(live).values()];
    return new Map(DRAWER_LINES.map((r) => [r, allLineNotices(r, held, alerts, feed?.outages ?? [], sys).length]));
  }, [live, alerts, feed, sys]);
  const { routes } = useMapOptions();
  const { closePanel } = usePanel();
  // The whole row opens the line: its trains, stations and notices, with the map in view.
  const openLine = (r: string) => { closePanel(); setSelectedLine(r); };
  return (
    <div className="space-y-2 text-sm" data-testid="lines-drawer">
      {routes.length ? <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Showing {routes.join(", ")}</span>
        <button type="button" onClick={() => setOptions({ routes: [] })}
          className="h-8 rounded-full border border-border px-3 text-xs font-semibold">Show all</button>
      </div> : null}
      <ul className="divide-y divide-border">
        {DRAWER_LINES.map((r) => {
          const count = counts.get(r) ?? 0;
          const status = lineStatus(alerts, r);
          const on = routes.includes(r);
          const name = data.subway?.stat?.routes[r]?.name ?? r;
          return (
            <li key={r} data-line={r}>
              <button type="button" onClick={() => openLine(r)} aria-label={`${name}: ${status}${count ? `, ${count} ${count === 1 ? "notice" : "notices"}` : ""}`}
                className={`flex w-full items-center gap-2 rounded-md px-1 py-2.5 text-left hover:bg-muted/60 ${on ? "bg-[hsl(var(--acc)/0.25)]" : ""}`}>
                <RouteBullet system="subway" route={r} data={data} />
                <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[status]}`}>{status}</span>
                {count ? <span className="shrink-0 text-[11px] text-muted-foreground">{count} {count === 1 ? "notice" : "notices"}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
