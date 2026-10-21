import { Accessibility, Crosshair, Star, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arrivalsAt, directionLabel, estimateTrain, minutesUntil, stationOf, type LiveSystem, type StaticSystem, type SystemId, type Vehicle } from "@/lib/transit/model";
import { useAlerts, useBuses, useNow, useStarred, useTransitData, type Outage } from "@/lib/transit/hooks";
import { setFollowed, useFollowed } from "@/lib/transit/follow";

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
  return (
    <div className="space-y-3 text-sm">
      <Button size="sm" variant="outline" aria-pressed={isStarred(starKey)} onClick={() => toggle(starKey)}>
        <Star className="mr-1.5 h-4 w-4" fill={isStarred(starKey) ? "currentColor" : "none"} />
        {isStarred(starKey) ? "Starred" : "Star station"}
      </Button>
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
    </div>
  );
}

/** Panel body for a vehicle: next stop, ETA and the Follow toggle. */
export function VehicleDetails({ vehicleKey }: { vehicleKey: string }) {
  const [system, ...rest] = vehicleKey.split(":");
  const tripId = rest.join(":");
  const rail = system === "bus" ? [] : [system as SystemId];
  const data = useTransitData(rail);
  const buses = useBuses(system === "bus");
  const now = useNow();
  const followed = useFollowed();
  let v: Vehicle | null | undefined;
  if (system === "bus") {
    const b = buses.data?.buses.find((x) => x.id === tripId);
    if (b) v = { key: vehicleKey, system: "bus", route: b.route, label: b.route, color: "#0039A6", lon: b.lon, lat: b.lat, bearing: b.bearing ?? 0, grade: "grade", dir: b.dir, nextStop: b.next ?? undefined };
  } else {
    const st = data[system as SystemId]?.stat, trip = data[system as SystemId]?.live?.trips.find((t) => t.id === tripId);
    v = st && trip ? estimateTrain(st, trip, now) : undefined;
  }
  const following = followed === vehicleKey;
  return (
    <div className="space-y-3 text-sm">
      {v ? <div className="text-muted-foreground">{directionLabel(v.system, v.nextStop ?? "", v.dir)}</div> : <div className="text-muted-foreground">No longer in the live feed.</div>}
      {v?.nextStop ? (
        <div>
          Next stop <span className="font-medium">{stopName(data, v.system, v.nextStop)}</span>
          {v.eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(v.eta, now)} min</span> : null}
        </div>
      ) : null}
      {v && v.system !== "bus" ? <p className="text-xs text-muted-foreground">Position estimated from predicted arrival times.</p> : null}
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
