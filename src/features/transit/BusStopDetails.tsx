import { useBusArrivals, useBusStopsNear, type BusArrival } from "./hooks";
import { etaText, nearestStop } from "./busStop";

/**
 * Panel body for a tapped bus stop: the routes that stop there and the next buses.
 * `onWatch` shows those routes' buses live on the map from above, centred on the stop;
 * `onFollow` focuses and follows the one bus on a tapped row (owner, 2026-10-27).
 */
export function BusStopDetails({ lon, lat, onWatch, onFollow }: { lon: number; lat: number; onWatch?: (routes: string[]) => void; onFollow?: (arrival: BusArrival) => void }) {
  const stops = useBusStopsNear({ lon, lat });
  const stop = stops.data ? nearestStop(stops.data.stops, lon, lat) : undefined;
  const arrivals = useBusArrivals(stop?.id);
  const now = Date.now() / 1000;
  if (stops.isLoading) return <p className="text-sm">Loading stop…</p>;
  if (!stop) return <p className="text-sm">Live bus times are not available for this stop right now.</p>;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-semibold">Routes{stop.dir ? ` · ${stop.dir}bound` : ""}</div>
        <div className="mt-1 flex flex-wrap gap-1">{stop.routes.map((r) => <span key={r} className="rounded bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white">{r}</span>)}</div>
      </div>
      <div>
        <div className="font-semibold">Next buses</div>
        {arrivals.isLoading ? <p>Loading…</p> : arrivals.data?.arrivals.length ? (
          <ul className="mt-1 space-y-1">
            {arrivals.data.arrivals.map((a, i) => {
              const row = <><span><b>{a.route}</b> {a.destination}</span><span className="shrink-0 tabular-nums">{etaText(a.eta, now) || a.away}</span></>;
              return (
                <li key={a.vehicle || i}>
                  {onFollow ? (
                    <button type="button" data-testid="follow-arrival" aria-label={`Follow the ${a.route} to ${a.destination} on the map`} onClick={() => onFollow(a)}
                      className="-mx-1.5 flex min-h-9 w-[calc(100%+0.75rem)] items-center justify-between gap-2 rounded-md px-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {row}
                    </button>
                  ) : <div className="flex justify-between gap-2">{row}</div>}
                </li>
              );
            })}
          </ul>
        ) : <p>No buses reported for this stop right now.</p>}
      </div>
      {onWatch ? (
        <button type="button" data-testid="watch-buses" onClick={() => onWatch(stop.routes)} className="task-action w-full">
          See them all coming on the map
        </button>
      ) : null}
    </div>
  );
}
