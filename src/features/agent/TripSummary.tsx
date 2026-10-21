import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import type { Trip } from "./schema";

const fmt = (local: string) => local.slice(11, 16);

/** Weather chip, lines, ETA, exit, planned work, elevators, driving context. Text only, no tooltips. */
export function TripSummary({ trip, compact, mapTime, bodyOnly }: { trip: Trip; compact?: boolean; mapTime?: string | null; bodyOnly?: boolean }) {
  const w = trip.weather;
  return (
    <div className="space-y-2 text-sm">
      {bodyOnly ? null : <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{fmt(trip.departIso)} → {fmt(trip.arriveIso)}</Badge>
        {trip.routes.map((r, i) => <Badge key={`${r}${i}`} variant="secondary">{r}</Badge>)}
        {w ? <Badge variant="outline">{w.summary} · {Math.round(w.tempC)}°C · {w.precipPct}% rain</Badge> : null}
        {mapTime ? <Badge variant="outline">Map time {mapTime.replace("T", " ")}</Badge> : null}
      </div>}
      {trip.exitAdvice && !bodyOnly ? <p className="font-medium">{trip.exitAdvice}</p> : null}
      {compact ? null : (
        <>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            {trip.legs.map((l, i) => <li key={i}>{l.label}{"durationS" in l ? ` · ${Math.max(1, Math.round(l.durationS / 60))} min` : ""}</li>)}
          </ol>
          {[["Planned work", trip.alerts], ["Elevators", trip.elevators], ["Weather alerts", trip.hazards], ["On the road", trip.context.map((c) => c.text)]].map(([title, items]) =>
            (items as string[]).length ? (
              <div key={title as string}>
                <div className="text-xs font-semibold uppercase text-muted-foreground">{title as string}</div>
                <ul className="list-disc pl-5">{(items as string[]).map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            ) : null,
          )}
          {trip.stubbed.length ? (
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-muted-foreground underline">About this estimate</CollapsibleTrigger>
              <CollapsibleContent className="pt-1 text-xs text-muted-foreground">{trip.stubbed.join(" ")}</CollapsibleContent>
            </Collapsible>
          ) : null}
        </>
      )}
    </div>
  );
}
