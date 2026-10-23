import { useCallback, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { usePanel, type PanelContent } from "@/lib/store/PanelContext";
import { alertGeometry, routeEnds, setAlertFocus } from "./alertFocus";
import { setFollowed } from "./follow";
import { otherDirection } from "@/lib/transit/serviceChanges";
import { useTransitData, type TransitAlert } from "./hooks";

/** Small route bullet (kept local so TransitCard can import this file without a cycle). */
function RouteBullet({ route, data }: { system: "subway"; route: string; data: ReturnType<typeof useTransitData> }) {
  const info = data.subway?.stat?.routes[route];
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold" style={{ background: info?.color ?? "#808183", color: info?.text ?? "#fff" }}>
      {info?.short ?? route}
    </span>
  );
}

const alertLabel = (a: TransitAlert): string =>
  a.reroute ? "Detour" : a.kind === "delay" ? "Delays" : a.kind === "planned" ? "Planned work" : "Notice";
/** The alert text without the "[F]" brackets, which read as noise in a sentence. */
const plain = (s: string): string => s.replace(/\[([A-Z0-9]+)\]/g, "$1");

const when = (t?: number) => (t ? new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

/** Open an alert: the map flies to it (TransitLayer) and the panel shows its card; Back returns to what was open before. */
function useOpenAlert(): (a: TransitAlert) => void {
  const { content, showPanel } = usePanel();
  return useCallback(
    (a: TransitAlert) => {
      // In place, not Stop following: that ease would pull the camera off the alert.
      setFollowed(null);
      const prev: PanelContent | null = content && !content.id.startsWith("transit:alert:") ? content : null;
      const back = () => {
        setAlertFocus(null);
        if (prev) window.setTimeout(() => showPanel(prev), 0);
      };
      setAlertFocus(a);
      showPanel({
        id: `transit:alert:${a.id}`,
        title: `${a.routes.slice(0, 3).join(" ")} ${alertLabel(a).toLowerCase()}`.trim(),
        subtitle: a.period || "Service alert",
        peek: `${a.routes[0] ?? ""} · ${alertLabel(a)}`,
        details: <AlertCard alert={a} onBack={back} />,
        onBack: back,
      });
    },
    [content, showPanel],
  );
}

/** One clickable alert row, used by the train sheet, the Lines drawer and Service status. */
export function AlertRow({ alert }: { alert: TransitAlert }) {
  const open = useOpenAlert();
  return (
    <button type="button" onClick={() => open(alert)} data-alert={alert.id}
      className="block w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-[hsl(var(--acc))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="mr-1 font-semibold">{alertLabel(alert)}</span>
      {plain(alert.text)}
      <span className="mt-0.5 block font-semibold underline underline-offset-2">Show on map</span>
    </button>
  );
}

/** The slim alert card: full text, active period, direction and affected stops. */
function AlertCard({ alert: a, onBack }: { alert: TransitAlert; onBack: () => void }) {
  const data = useTransitData(["subway"]);
  const sub = data.subway?.stat;
  const geo = useMemo(() => (sub ? alertGeometry(a, sub) : null), [a, sub]);
  const { closePanel } = usePanel();
  const [more, setMore] = useState(false);
  const period = a.period || [when(a.start), a.end ? when(a.end) : "until further notice"].filter(Boolean).join(" – ");
  return (
    <div className="space-y-3 text-sm" data-testid="alert-card">
      <div className="flex flex-wrap items-center gap-1.5">
        {a.routes.map((r) => <RouteBullet key={r} system="subway" route={r} data={data} />)}
        <span className="rounded-full border border-[hsl(var(--acc))] px-2 py-0.5 text-[11px] font-semibold">{alertLabel(a)}</span>
        {a.type ? <span className="text-xs text-muted-foreground">{a.type}</span> : null}
      </div>
      <p className="font-medium">{plain(a.text)}</p>
      {a.replacement?.length ? (
        <p className="font-medium">Shuttle bus {a.replacement.join(", ")} covers the gap. The map is showing that bus.</p>
      ) : null}
      {a.description ? (
        <div className="text-xs text-muted-foreground">
          <p className={`whitespace-pre-line ${more ? "" : "line-clamp-3"}`}>{plain(a.description)}</p>
          <button type="button" onClick={() => setMore(!more)} className="mt-0.5 font-semibold text-foreground underline underline-offset-2">{more ? "Less" : "Full details"}</button>
        </div>
      ) : null}
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Active</dt><dd>{period || "Now"}</dd>
        <dt className="text-muted-foreground">Direction</dt><dd>{a.direction || (a.directionIds?.length === 1 ? (a.directionIds[0] === 0 ? "Northbound" : "Southbound") : "Both directions")}</dd>
        {a.via?.length ? (<><dt className="text-muted-foreground">Runs via</dt><dd className="flex gap-1">{a.via.map((r) => <RouteBullet key={r} system="subway" route={r} data={data} />)}</dd></>) : null}
        <dt className="text-muted-foreground">Affected stops</dt>
        <dd>{geo?.skipped.length ? geo.skipped.map((s) => s.name).join(", ") : "Whole line"}</dd>
        {a.changes?.filter((c) => c.kind === "skip" && c.toward).slice(0, 1).map((c) => (
          <div key={c.alertId + c.route} className="contents"><dt className="text-muted-foreground">Skips</dt><dd className="font-semibold"><s>{c.toward}-bound</s> · {sub && c.toward ? `${otherDirection(c.toward, routeEnds(sub, c.route))}-bound stops` : "other direction stops"}</dd></div>
        ))}
        {a.changes?.filter((c) => c.kind === "platform").map((c) => (
          <div key={c.names.join()} className="contents"><dt className="text-muted-foreground">Platform</dt><dd className="font-semibold">{c.names.join(", ")}: {c.notice}</dd></div>
        ))}
      </dl>
      <button type="button" onClick={() => { onBack(); closePanel(); }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" />Back
      </button>
    </div>
  );
}
