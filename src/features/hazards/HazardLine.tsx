import { AlertTriangle } from "lucide-react";
import { usePanel } from "@/lib/store/PanelContext";
import { useHazards, type HazardsData } from "./data";

const HOUR = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function until(ends: string | null): string {
  const d = ends ? new Date(ends) : null;
  return d && !Number.isNaN(d.getTime()) ? ` until ${HOUR.format(d).replace(":00", "")}` : "";
}

function HazardCard({ data }: { data: HazardsData }) {
  return (
    <div className="space-y-3 text-xs">
      {data.alerts.map((a) => (
        <div key={a.id}>
          <div className="font-medium text-foreground">
            {a.event}
            {until(a.ends)}
          </div>
          <div className="text-muted-foreground">{a.headline}</div>
        </div>
      ))}
      {data.sensors.length ? (
        <div>
          <div className="font-medium text-foreground">Street flooding now (FloodNet sensors)</div>
          <ul className="mt-1 space-y-0.5">
            {data.sensors.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums">{Math.round(s.depthMm / 25.4)} in</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="text-[10px] text-muted-foreground">
        National Weather Service · FloodNet NYC{data.mock ? " · sample data" : ""}
      </div>
    </div>
  );
}

/** One plain line under the search bar; tapping it opens one panel card. */
export function HazardLine() {
  const { data } = useHazards();
  const { showPanel } = usePanel();
  if (!data || (!data.alerts.length && !data.sensors.length)) return null;
  const top = data.alerts[0];
  const text = top
    ? `${top.event}${until(top.ends)}`
    : `Street flooding at ${data.sensors.length} sensor${data.sensors.length > 1 ? "s" : ""}`;
  return (
    <button
      type="button"
      onClick={() =>
        showPanel({ id: "hazard:active", title: "Weather alerts", subtitle: text, details: <HazardCard data={data} /> })
      }
      className="flex min-w-0 items-center gap-1.5 rounded-full text-left text-[11px] font-medium text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </button>
  );
}
