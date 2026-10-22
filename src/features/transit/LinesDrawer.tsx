import { useState } from "react";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { lineStatus, type LineStatus } from "./alertFocus";
import { AlertRow } from "./AlertCard";
import { useAlerts, useTransitData } from "./hooks";
import { RouteBullet } from "./TransitCard";

/** Every subway service plus the shuttles and SIR, in MTA order. */
const DRAWER_LINES = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "GS", "FS", "H", "SI"];

const BADGE: Record<LineStatus, string> = {
  "Good service": "border-border text-muted-foreground",
  Delays: "border-foreground bg-foreground text-background",
  Detour: "border-[hsl(var(--acc))] bg-[hsl(var(--acc))] text-[hsl(var(--acc-foreground))]",
  "Planned work": "border-foreground text-foreground",
};

/** Lines drawer (#253): tap a row to isolate that line (several allowed), expand it for its alerts. */
export function LinesDrawer() {
  const data = useTransitData(["subway"]);
  const alerts = useAlerts(true).data?.alerts ?? [];
  const { routes } = useMapOptions();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (r: string) => setOptions({ routes: routes.includes(r) ? routes.filter((x) => x !== r) : [...routes, r] });
  return (
    <div className="space-y-2 text-sm" data-testid="lines-drawer">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{routes.length ? `Showing ${routes.join(", ")}` : "Tap lines to show only those"}</span>
        <button type="button" onClick={() => setOptions({ routes: [] })} disabled={!routes.length}
          className="h-8 rounded-full border border-border px-3 text-xs font-semibold disabled:opacity-40">Show all</button>
      </div>
      <ul className="divide-y divide-border">
        {DRAWER_LINES.map((r) => {
          const mine = alerts.filter((a) => a.routes.includes(r));
          const status = lineStatus(alerts, r);
          const on = routes.includes(r);
          const name = data.subway?.stat?.routes[r]?.name ?? r;
          return (
            <li key={r} className="py-1.5" data-line={r}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggle(r)} aria-pressed={on}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left ${on ? "bg-[hsl(var(--acc)/0.25)]" : ""}`}>
                  <RouteBullet system="subway" route={r} data={data} />
                  <span className="truncate text-xs">{name}</span>
                </button>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[status]}`}>{status}</span>
                <button type="button" onClick={() => setOpen(open === r ? null : r)} disabled={!mine.length}
                  className="h-7 shrink-0 rounded-full border border-border px-2 text-[11px] font-semibold disabled:opacity-30">
                  {open === r ? "Hide" : `Alerts ${mine.length}`}
                </button>
              </div>
              {open === r ? <div className="mt-1.5 space-y-1.5 pl-7">{mine.map((a) => <AlertRow key={a.id} alert={a} />)}</div> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
