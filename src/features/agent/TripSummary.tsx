import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Ship } from "lucide-react";
import { useFlags } from "@/lib/flags";
import { headsUpFacts, recommend, type HourWeather } from "@/lib/weather/street";
import type { Leg, Trip, TripCore } from "./schema";

/** "Take an umbrella (52°F · 70% rain, 1.2 mm)" for the departure hour, behind the streetWeather flag. */
function WeatherHeadsUp({ trip }: { trip: Trip }) {
  const flags = useFlags();
  const w = trip.weather;
  if (!flags.streetWeather || !w) return null;
  const h: HourWeather = {
    time: w.time, tempC: w.tempC, precipPct: w.precipPct, code: w.code ?? null, feelsLikeC: w.feelsLikeC ?? null,
    precipMm: w.precipMm ?? null, windKmh: w.windKmh ?? null, gustKmh: w.gustKmh ?? null, cloudPct: null, visibilityM: null,
  };
  return (
    <p className="font-medium" data-testid="trip-weather-headsup">
      {recommend(h, trip.hazards).text} <span className="font-normal text-muted-foreground">({headsUpFacts(h).join(" · ")})</span>
    </p>
  );
}

const fmt = (local: string) => local.slice(11, 16);
const mins = (a: string, b: string) => Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000);

/** Route bullet: round for subway, rounded-rect for bus/rail/ferry; GTFS colour when known. */
function RouteBullet({ route, mode, color }: { route: string; mode?: string; color?: string }) {
  const round = !mode || mode === "subway";
  if (mode === "ferry") {
    return (
      <span aria-label={`${route} ferry`} className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-bold leading-none text-white" style={{ backgroundColor: color ?? "#1D7FB8" }}>
        <Ship className="h-3 w-3" aria-hidden />{route}
      </span>
    );
  }
  return (
    <span
      aria-label={`${route} ${mode ?? "subway"}`}
      className={`inline-flex h-5 min-w-5 items-center justify-center px-1 text-[11px] font-bold leading-none text-white ${round && route.length <= 2 ? "rounded-full" : "rounded"}`}
      style={{ backgroundColor: color ?? (mode === "bus" ? "#0039A6" : "#555") }}
    >{route}</span>
  );
}

function LegRow({ l }: { l: Leg }) {
  const dur = "durationS" in l ? ` · ${Math.max(1, Math.round(l.durationS / 60))} min` : "";
  if (l.kind === "ride" && l.fromStop) {
    return (
      <li>
        <span className="inline-flex items-center gap-1"><RouteBullet route={l.route} mode={l.mode} color={l.color} /> {l.mode === "bus" ? "Bus" : l.mode === "subway" ? "Train" : l.mode === "ferry" ? "Ferry" : "Train"}{l.headsign ? ` toward ${l.headsign}` : ""}{dur}</span>
        <div className="text-xs">Board at {l.fromStop} · get off at {l.toStop}{l.numStops ? ` · ${l.numStops} stop${l.numStops === 1 ? "" : "s"}` : ""}</div>
      </li>
    );
  }
  return <li>{l.label}{dur}</li>;
}

function OtherOptions({ trip, onSelect }: { trip: Trip; onSelect?: (t: TripCore) => void }) {
  if (!trip.alternatives.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground">Other options</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {trip.alternatives.map((a) => {
          const d = mins(trip.arriveIso, a.arriveIso);
          const rides = a.legs.filter((l): l is Extract<Leg, { kind: "ride" }> => l.kind === "ride");
          return (
            <button key={a.id} type="button" onClick={() => onSelect?.(a)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted" aria-label={`Option arriving ${fmt(a.arriveIso)}`}>
              {rides.length ? rides.map((r, i) => <RouteBullet key={i} route={r.route} mode={r.mode} color={r.color} />) : "Walk"}
              <span>{fmt(a.departIso)}–{fmt(a.arriveIso)}</span>
              <span className="text-muted-foreground">{d === 0 ? "same time" : d > 0 ? `+${d} min` : `${d} min`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Swap the chosen alternative in as the main trip; the old main joins the alternatives. */
export function selectAlternative(trip: Trip, alt: TripCore): Trip {
  const { alternatives, ...main } = trip;
  return { ...alt, alternatives: [main, ...alternatives.filter((a) => a.id !== alt.id)] };
}

/** Weather chip, lines, ETA, exit, planned work, elevators, driving context. Text only, no tooltips. */
export function TripSummary({ trip, compact, mapTime, bodyOnly, onSelect }: { trip: Trip; compact?: boolean; mapTime?: string | null; bodyOnly?: boolean; onSelect?: (t: TripCore) => void }) {
  const w = trip.weather;
  const rides = trip.legs.filter((l): l is Extract<Leg, { kind: "ride" }> => l.kind === "ride");
  return (
    <div className="space-y-2 text-sm">
      {bodyOnly ? null : <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{fmt(trip.departIso)} → {fmt(trip.arriveIso)}</Badge>
        {rides.length ? rides.map((r, i) => <RouteBullet key={`${r.route}${i}`} route={r.route} mode={r.mode} color={r.color} />) : trip.routes.map((r, i) => <Badge key={`${r}${i}`} variant="secondary">{r}</Badge>)}
        {w ? <Badge variant="outline">{w.summary} · {Math.round(w.tempC)}°C · {w.precipPct}% rain</Badge> : null}
        {mapTime ? <Badge variant="outline">Map time {mapTime.replace("T", " ")}</Badge> : null}
      </div>}
      {bodyOnly ? null : <WeatherHeadsUp trip={trip} />}
      {trip.exitAdvice && !bodyOnly ? <p className="font-medium">{trip.exitAdvice}</p> : null}
      {compact ? <OtherOptions trip={trip} onSelect={onSelect} /> : (
        <>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            {trip.legs.map((l, i) => <LegRow key={i} l={l} />)}
          </ol>
          <OtherOptions trip={trip} onSelect={onSelect} />
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
