import { liveProgress } from "./monotonic";
import { useEffect } from "react";
import { Accessibility, Crosshair, ScanEye, Star, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arrivalsAt, directionLabel, estimateTrain, minutesUntil, stationOf, type LiveSystem, type StaticSystem, type SystemId, type Vehicle } from "./model";
import { useAlerts, useBusRoute, useBusTrip, useBuses, useNow, useStarred, useTransitData, type Outage } from "./hooks";
import { setFollowed, useFollowed } from "./follow";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { getXray, setXray, useXray } from "./xray";

type Data = Partial<Record<SystemId, { stat?: StaticSystem; live?: LiveSystem }>>;

export function RouteBullet({ system, route, data }: { system: SystemId | "bus"; route: string; data: Data }) {
  const info = system === "bus" ? undefined : data[system]?.stat?.routes[route];
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
      style={{ background: info?.color ?? "#0039A6", color: info?.text ?? "#fff" }}>
      {system === "subway" ? (info?.short ?? route) : route.length > 4 ? (info?.short ?? route).split(" ")[0] : (info?.short ?? route)}
    </span>
  );
}

const stopName = (data: Data, system: SystemId | "bus", stop?: string) => {
  if (!stop || system === "bus") return stop;
  const id = stationOf(system, stop);
  return data[system]?.stat?.stations.features.find((f) => f.properties.id === id)?.properties.name ?? stop;
};

/** Panel body for a station: next arrivals by line and direction, outages, planned work. */
export function StationDetails({ system, id }: { system: SystemId; id: string }) {
  const data = useTransitData([system]);
  const alerts = useAlerts(true).data;
  const now = useNow();
  const { isStarred, toggle } = useStarred();
  const rows = arrivalsAt(system, data[system]?.live, id, now);
  const starKey = `${system}:station:${id}`;
  const xray = useXray();
  // Leaving the station panel turns x-ray off.
  useEffect(() => () => { if (getXray() === id) setXray(null); }, [id]);
  const st = data[system]?.stat;
  const routes = [...new Set(String(st?.stations.features.find((f) => f.properties.id === id)?.properties.routes ?? "").split(/[\s,]+/).filter(Boolean))];
  const doors = system === "subway" ? (st?.entrances?.features ?? []).filter((f) => f.properties.id === id) : [];
  const lineAlerts = (alerts?.alerts ?? []).filter((a) => a.kind === "delay" && a.routes.some((r) => routes.includes(r)));
  return (
    <div className="space-y-3 text-sm">
      {routes.length ? (
        <div className="flex flex-wrap gap-1" aria-label="Lines at this station">
          {routes.map((r) => <RouteBullet key={r} system={system} route={r} data={data} />)}
        </div>
      ) : null}
      <Button size="sm" variant="outline" aria-pressed={isStarred(starKey)} onClick={() => toggle(starKey)}>
        <Star className="mr-1.5 h-4 w-4" fill={isStarred(starKey) ? "currentColor" : "none"} />
        {isStarred(starKey) ? "Starred" : "Star station"}
      </Button>
      {system === "subway" ? (
        <Button size="sm" variant="outline" className="ml-2" aria-pressed={xray === id} onClick={() => setXray(xray === id ? null : id)}>
          <ScanEye className="mr-1.5 h-4 w-4" />
          X-ray
        </Button>
      ) : null}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={`${a.route}|${a.direction}`} className="flex items-center gap-2">
            <RouteBullet system={system} route={a.route} data={data} />
            <span className="flex-1 text-muted-foreground">{a.direction}</span>
            <span className="tabular-nums">{a.times.map((t) => `${minutesUntil(t, now)}`).join(", ")} min</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Star line ${a.route}`}
              aria-pressed={isStarred(`${system}:line:${a.route}`)} onClick={() => toggle(`${system}:line:${a.route}`)}>
              <Star className="h-3.5 w-3.5" fill={isStarred(`${system}:line:${a.route}`) ? "currentColor" : "none"} />
            </Button>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground">No live arrivals right now.</li> : null}
      </ul>
      {system === "subway"
        ? alerts?.outages.filter((o) => o.stops.some((s) => stationOf("subway", s) === id)).map((o) => <OutageRow key={o.id} o={o} />)
        : null}
      {alerts?.alerts
        .filter((a) => (a.kind === "planned" || a.reroute) && a.stops.some((s) => stationOf(system, s) === id))
        .map((a) => (
          <div key={a.id} className="flex gap-2">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p><span className="text-xs text-muted-foreground">{a.type}</span> {a.text}</p>
          </div>
        ))}
      {lineAlerts.map((a) => (
        <div key={a.id} className="rounded-md border px-2 py-1.5 text-xs"><span className="mr-1 font-semibold">Delay</span>{a.text}</div>
      ))}
      {doors.length ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entrances</div>
          <ul className="mt-1 space-y-0.5">{doors.slice(0, 8).map((d, i) => <li key={i}>{d.properties.name || "Entrance"}{d.properties.kind ? <span className="text-muted-foreground"> · {d.properties.kind}</span> : null}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

/** Panel body for a vehicle: next stop, ETA and the Follow toggle. */
/** Nearest of a route's stops to a point, by equirectangular metres. Pure; runs only in the browser. */
export function nearestStop<T extends { lon: number; lat: number }>(stops: T[], at: { lon: number; lat: number }): T | undefined {
  const k = Math.cos((at.lat * Math.PI) / 180);
  let best: T | undefined, bd = Infinity;
  for (const st of stops) {
    const d = ((st.lon - at.lon) * k) ** 2 + (st.lat - at.lat) ** 2;
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

function RouteAlerts({ route }: { route: string }) {
  const alerts = useAlerts(true);
  const list = (alerts.data?.alerts ?? []).filter((a) => a.routes.includes(route));
  if (!list.length) return <p className="text-xs text-muted-foreground">No active alerts for the {route}.</p>;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Alerts and detours</div>
      {list.slice(0, 4).map((a) => (
        <div key={a.id} className="rounded-md border px-2 py-1.5 text-xs">
          <span className="mr-1 font-semibold">{a.reroute ? "Detour" : a.kind === "delay" ? "Delay" : a.kind === "planned" ? "Planned work" : "Notice"}</span>
          {a.text}
        </div>
      ))}
    </div>
  );
}

function Upcoming({ rows, now }: { rows: Array<{ id: string; name: string; eta: number | null }>; now: number }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next stops</div>
      <ol className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.eta ? `${minutesUntil(r.eta, now)} min` : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BusDetails({ id, route }: { id: string; route: string }) {
  const trip = useBusTrip(id);
  const shape = useBusRoute(route || undefined);
  const now = useNow();
  const me = useSharedLocation();
  const calls = trip.data?.calls ?? [];
  // Your stop is worked out here in the browser from the route's stop list; your location never leaves the device for this.
  const mine = me.coords && shape.data ? nearestStop(shape.data.stops, me.coords) : undefined;
  const myCall = mine ? calls.find((c) => c.id === mine.id) : undefined;
  if (trip.isLoading) return <p className="text-muted-foreground">Loading this bus…</p>;
  if (!trip.data?.found) return <p className="text-muted-foreground">No longer in the live feed.</p>;
  return (
    <>
      <div><span className="font-semibold">{trip.data.route}</span> <span className="text-muted-foreground">to</span> <span className="font-medium">{trip.data.destination}</span></div>
      {calls[0] ? (
        <div>Next stop <span className="font-medium">{calls[0].name}</span>
          {calls[0].eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(calls[0].eta, now)} min</span> : calls[0].away ? <span className="text-muted-foreground"> · {calls[0].away}</span> : null}
        </div>
      ) : null}
      {mine ? (
        <div className="rounded-md bg-muted px-2 py-1.5">
          Near you: <span className="font-medium">{mine.name}</span>
          {myCall?.eta ? <span className="tabular-nums"> · {minutesUntil(myCall.eta, now)} min</span> : <span className="text-muted-foreground"> · not on this bus&apos;s way</span>}
        </div>
      ) : null}
      <Upcoming rows={calls.slice(1, 6)} now={now} />
    </>
  );
}

export function VehicleDetails({ vehicleKey }: { vehicleKey: string }) {
  const [system, ...rest] = vehicleKey.split(":");
  const tripId = rest.join(":");
  const rail = system === "bus" ? [] : [system as SystemId];
  const data = useTransitData(rail);
  const buses = useBuses(system === "bus");
  const now = useNow();
  const followed = useFollowed();
  let v: Vehicle | null | undefined;
  let upcoming: Array<{ id: string; name: string; eta: number | null }> = [];
  if (system === "bus") {
    const b = buses.data?.buses.find((x) => x.id === tripId);
    if (b) v = { key: vehicleKey, system: "bus", route: b.route, label: b.route, color: "#0039A6", lon: b.lon, lat: b.lat, bearing: b.bearing ?? 0, grade: "grade", dir: b.dir, nextStop: b.next ?? undefined };
  } else {
    const st = data[system as SystemId]?.stat, trip = data[system as SystemId]?.live?.trips.find((t) => t.id === tripId);
    v = st && trip ? estimateTrain(st, trip, now, liveProgress) : undefined;
    if (trip) upcoming = trip.stops.filter(([, t]) => t >= now - 30).slice(1, 6).map(([id, t]) => ({ id, name: stopName(data, system as SystemId, id) ?? id, eta: t }));
  }
  const following = followed === vehicleKey;
  return (
    <div className="space-y-3 text-sm">
      {system === "bus" ? <BusDetails id={tripId} route={v?.route ?? ""} /> : (
        <>
          {v ? <div className="text-muted-foreground">{directionLabel(v.system, v.nextStop ?? "", v.dir)}</div> : <div className="text-muted-foreground">No longer in the live feed.</div>}
          {v?.stopped ? (
            <div className="font-medium">
              {v.stopped.kind === "at" ? <>At {stopName(data, v.system, v.stopped.stop)}</>
                : v.stopped.kind === "departs" ? <>Departs {stopName(data, v.system, v.stopped.stop)} in <span className="tabular-nums">{minutesUntil(v.stopped.t, now)}</span> min</>
                : <>Arrived at {stopName(data, v.system, v.stopped.stop)}</>}
            </div>
          ) : null}
          {v?.nextStop && v.stopped?.kind !== "arrived" ? (
            <div>
              Next stop <span className="font-medium">{stopName(data, v.system, v.nextStop)}</span>
              {v.eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(v.eta, now)} min</span> : null}
            </div>
          ) : null}
          <Upcoming rows={upcoming} now={now} />
          {v ? <p className="text-xs text-muted-foreground">Position estimated from predicted arrival times.</p> : null}
        </>
      )}
      {v ? <RouteAlerts route={v.route} /> : null}
      <Button size="sm" variant={following ? "default" : "outline"} aria-pressed={following} disabled={!v}
        onClick={() => setFollowed(following ? null : vehicleKey)}>
        <Crosshair className="mr-1.5 h-4 w-4" />
        {following ? "Following · drag or Esc to stop" : "Follow"}
      </Button>
    </div>
  );
}

/** One elevator / escalator outage: what is out, why, when it is back, and step-free status. */
export function OutageRow({ o }: { o: Outage }) {
  return (
    <div className="flex gap-2">
      <Accessibility className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <div className="text-sm">
        <div><span className="font-medium">{o.equipment} out</span> · {o.serving}</div>
        <div className="text-xs text-muted-foreground">{o.reason} · back {o.back || "unknown"}</div>
        <div className="text-xs">
          {o.ada === "yes" ? "Station still step-free accessible" : o.ada === "no" ? "Not step-free accessible right now" : "Station is not ADA-accessible"}
        </div>
      </div>
    </div>
  );
}

/**
 * Follow mode's slim card (top centre, never blocks the view): route, next
 * stop, ETA and any delay. The camera switcher and "Stop following" live in
 * the view switcher at the bottom.
 */
export function FollowCard({ vehicle }: { vehicle: Vehicle }) {
  const now = useNow();
  const sys = vehicle.system === "bus" ? [] : [vehicle.system as SystemId];
  const data = useTransitData(sys);
  const alerts = useAlerts(true);
  const delay = (alerts.data?.alerts ?? []).find((a) => a.routes.includes(vehicle.route) && a.kind !== "planned");
  const next = vehicle.stopped?.kind === "at" ? vehicle.stopped.stop : vehicle.nextStop;
  return (
    <div data-testid="follow-card" className="pointer-events-none absolute left-1/2 top-16 z-30 w-[min(92vw,420px)] -translate-x-1/2 lg:top-3">
      <div className="pointer-events-auto flex items-center gap-[var(--sp-2)] rounded-xl border border-border bg-card/95 px-[var(--sp-3)] py-1.5 text-[12px] shadow-lg backdrop-blur-md">
        <RouteBullet system={vehicle.system} route={vehicle.route} data={data} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {vehicle.stopped?.kind === "at" ? "At " : "Next "}
            {next ? stopName(data, vehicle.system, next) : "—"}
            {vehicle.eta && vehicle.stopped?.kind !== "at" ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(vehicle.eta, now)} min</span> : null}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {delay ? <><span className="font-semibold text-foreground">{delay.reroute ? "Detour" : "Delay"}:</span> {delay.text}</> : "No delays reported"}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{vehicle.grade === "underground" ? "Underground" : vehicle.grade === "elevated" ? "Elevated" : "At grade"}</span>
      </div>
    </div>
  );
}
