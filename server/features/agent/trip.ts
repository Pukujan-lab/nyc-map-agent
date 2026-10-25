/** Compose one door-to-door trip from the thin services + the transit planner. */
import { formatStreetText } from "../../../src/lib/streetName";
import type { Leg, LngLatTuple, Trip, TripCore } from "../../../src/features/agent/schema";
import { elevatorStatus, hazardsAt, reverseGeocode, routeWalk, serviceAlerts, stationServiceChanges, weatherAt, type WalkResult } from "./services";
import { sameStation, type ServiceChange } from "../../../src/lib/transit/serviceChanges";
import { distM, octant, openDataEntrances, stubPlanner, type AvoidStop, type Entrance, type Station, type StationEntrances, type TransitPlanner } from "./transit";

export const TZ = "America/New_York";

/** "2026-10-22T09:00" in New York → Date (DST-correct via Intl). */
export function nyLocalToDate(local: string): Date {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(local)) return new Date(local);
  const guess = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(guess).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(off);
  const mins = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -300;
  return new Date(guess.getTime() - mins * 60_000);
}
export function toNyLocal(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export const walkLeg = (kind: "walk" | "transfer", label: string, w: WalkResult): Leg => ({ kind, label, coords: w.coords, durationS: w.durationS, distanceM: w.distanceM, turns: w.turns });
export const straight = (a: LngLatTuple, b: LngLatTuple): WalkResult => ({ coords: [a, b], distanceM: distM(a, b), durationS: distM(a, b) / 1.35, turns: [] });

export async function portalFor(st: Station, ents: Entrance[], toward: LngLatTuple, mode: "entry" | "exit", outages: string[]) {
  const usable = ents.filter((e) => (mode === "entry" ? e.entry : e.exit));
  const pick = (usable.length ? usable : ents).sort((a, b) => distM(a.at, toward) - distM(b.at, toward))[0];
  const at = pick?.at ?? st.at;
  const dir = octant(st.at, at);
  const street = await reverseGeocode(at);
  const type = pick?.type ?? "Station";
  const elevatorOnly = /elevator/i.test(type);
  const outage = elevatorOnly ? outages[0] ?? null : null;
  const word = mode === "entry" ? "entrance" : "exit";
  return { lon: at[0], lat: at[1], type, elevatorOnly, outage, label: `${dir} ${word}${street ? ` on ${street}` : ""}${elevatorOnly ? " (elevator)" : ""}` };
}

export interface TripDeps { planner?: TransitPlanner; entrances?: StationEntrances; changes?: ServiceChange[] }

const MIDTOWN: LngLatTuple = [-73.985, 40.758];
/** Does a ride from → to head toward the alert's direction label ("Flushing", "Manhattan")? Unknown labels count as yes. */
function headsToward(label: string, route: string, from: LngLatTuple, to: LngLatTuple, stations: Station[]): boolean {
  const target = /manhattan/i.test(label) ? MIDTOWN : stations.find((s) => s.routes.includes(route) && s.name.toLowerCase().startsWith(label.toLowerCase()))?.at;
  return target ? distM(to, target) < distM(from, target) : true;
}
/** Planner predicate: a station is avoided only for the route and direction an active skip names. */
export function avoidFor(changes: ServiceChange[], stations: Station[]): AvoidStop {
  return (st, route, from, to) => changes.some((c) => c.kind === "skip" && c.route === route.replace(/X$/, "") && c.names.some((n) => sameStation(n, st.name)) && (!c.toward || headsToward(c.toward, route, from.at, to.at, stations)));
}
/** Platform-change notices that apply to boarding `route` at `st` heading from → to. */
export function platformNotes(changes: ServiceChange[], st: Station, route: string, from: Station, to: Station, stations: Station[]): string[] {
  return changes.filter((c) => c.kind === "platform" && c.route === route.replace(/X$/, "") && c.names.some((n) => sameStation(n, st.name)) && (!c.toward || headsToward(c.toward, route, from.at, to.at, stations))).map((c) => c.notice);
}

/** Stations the trip's lines skip right now, placed on the map (a name no station on that line matches is left out). */
export function skippedStops(changes: ServiceChange[], stations: Station[], routes: string[]): Trip["skips"] {
  const lines = new Set(routes.map((r) => r.replace(/X$/, "")));
  const out: Trip["skips"] = [];
  const seen = new Set<string>();
  for (const c of changes) {
    if (c.kind !== "skip" || !lines.has(c.route)) continue;
    for (const n of c.names) {
      const st = stations.find((s) => s.routes.includes(c.route) && sameStation(n, s.name));
      const key = `${c.route}|${st?.id}|${c.toward}`;
      if (!st || seen.has(key)) continue;
      seen.add(key);
      out.push({ route: c.route, name: st.name, at: st.at, toward: c.toward });
    }
  }
  return out;
}

/** Active skips on a trip's lines, for planners that do not route around them (OTP). */
export async function tripSkips(routes: string[], departLocal: string, deps: TripDeps = {}): Promise<Trip["skips"]> {
  const changes = deps.changes ?? await safe(stationServiceChanges(Math.floor(nyLocalToDate(departLocal).getTime() / 1000)), [] as ServiceChange[]);
  if (!changes.some((c) => c.kind === "skip")) return [];
  return skippedStops(changes, await safe((deps.entrances ?? openDataEntrances).stations(), [] as Station[]), routes);
}

export async function buildTrip(
  origin: { label: string; at: LngLatTuple },
  destination: { label: string; at: LngLatTuple },
  departLocal: string,
  deps: TripDeps = {},
): Promise<Trip> {
  const entrancesSrc = deps.entrances ?? openDataEntrances;
  const planner = deps.planner ?? stubPlanner(entrancesSrc);
  const depart = nyLocalToDate(departLocal);
  const stubbed = ["transit_plan: MTA open-data stations + straight-line ride (live transit #56 not merged; GTFS shapes/realtime pending)"];
  const changes = deps.changes ?? await safe(stationServiceChanges(Math.floor(depart.getTime() / 1000)), [] as ServiceChange[]);
  const allStations = changes.length ? await safe(entrancesSrc.stations(), [] as Station[]) : [];
  const [plan, weather, hazards] = await Promise.all([
    safe(planner.plan(origin.at, destination.at, depart, avoidFor(changes, allStations)), null),
    safe(weatherAt(origin.at, toNyLocal(depart)), null),
    safe(hazardsAt(origin.at), [] as string[]),
  ]);
  const legs: Leg[] = [];
  const elevators: string[] = [];
  let exitAdvice: string | null = null;
  let alerts: string[] = [];
  const routes = plan?.rides.map((r) => r.route) ?? [];

  if (!plan) {
    const w = await safe(routeWalk(origin.at, destination.at), straight(origin.at, destination.at));
    legs.push(walkLeg("walk", `Walk to ${formatStreetText(destination.label)}`, w));
  } else {
    const first = plan.rides[0];
    const last = plan.rides[plan.rides.length - 1];
    const [inOut, outOut] = await Promise.all([safe(elevatorStatus(first.from.name), []), safe(elevatorStatus(last.to.name), [])]);
    elevators.push(...inOut, ...outOut);
    const [entIn, entOut] = await Promise.all([safe(entrancesSrc.entrances(first.from.complexId), []), safe(entrancesSrc.entrances(last.to.complexId), [])]);
    const enter = await portalFor(first.from, entIn, origin.at, "entry", inOut);
    const exit = await portalFor(last.to, entOut, destination.at, "exit", outOut);
    const [w1, w2] = await Promise.all([
      safe(routeWalk(origin.at, [enter.lon, enter.lat]), straight(origin.at, [enter.lon, enter.lat])),
      safe(routeWalk([exit.lon, exit.lat], destination.at), straight([exit.lon, exit.lat], destination.at)),
    ]);
    const ref = (s: Station) => ({ id: s.id, name: s.name, lon: s.at[0], lat: s.at[1] });
    legs.push(walkLeg("walk", `Walk to ${first.from.name}`, w1));
    const note = (r: (typeof plan.rides)[number]) => {
      const n = platformNotes(changes, r.from, r.route, r.from, r.to, allStations);
      return n.length ? `. ${n.join(". ")}` : "";
    };
    legs.push({ kind: "enter", station: ref(first.from), portal: enter, label: `Enter ${first.from.name} at the ${enter.label}${note(first)}` });
    plan.rides.forEach((r, i) => {
      if (i > 0) legs.push(walkLeg("transfer", `Transfer to the ${r.route} at ${r.from.name}${note(r)}`, straight(plan.rides[i - 1].to.at, r.from.at)));
      legs.push({ kind: "ride", mode: "subway", fromStop: r.from.name, toStop: r.to.name, numStops: r.stops.length || undefined, route: r.route, label: `${r.route} train ${r.from.name} → ${r.to.name}`, coords: r.coords, durationS: r.durationS, stops: r.stops, underground: !/elevated|viaduct|embankment/i.test(r.from.structure), geometrySource: r.geometrySource });
    });
    legs.push({ kind: "exit", station: ref(last.to), portal: exit, label: `Use the ${exit.label} at ${last.to.name}` });
    legs.push(walkLeg("walk", `Walk from ${last.to.name} to ${formatStreetText(destination.label)}`, w2));
    exitAdvice = `Use the ${exit.label} at ${last.to.name}.${exit.elevatorOnly ? " It is elevator-only." : ""}${exit.outage ? ` Heads up: ${exit.outage}.` : ""}`;
    alerts = await safe(serviceAlerts(routes, Math.floor(depart.getTime() / 1000)), []);
  }
  const waitS = plan ? 240 : 0; // average headway wait, stub until GTFS-rt arrivals
  const totalS = legs.reduce((s, l) => s + ("durationS" in l ? l.durationS : 60), 0) + waitS;
  return {
    id: crypto.randomUUID(),
    mode: plan ? "transit" : "walk",
    origin, destination,
    departIso: toNyLocal(depart),
    arriveIso: toNyLocal(new Date(depart.getTime() + totalS * 1000)),
    legs, routes, alerts, elevators, hazards,
    weather,
    exitAdvice,
    context: [],
    skips: skippedStops(changes, allStations, routes),
    stubbed: plan ? stubbed : [],
    planner: "fallback",
    alternatives: [],
  };
}

/** Short, token-cheap view of a trip for the model. */
const mins = (a: string, b: string) => Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000);
const summary = (t: TripCore) => t.legs.filter((l) => l.kind === "ride").map((l) => (l.kind === "ride" ? `${l.route} ${l.mode}` : "")).join(" → ") || "walk";
export function tripBrief(t: Trip) {
  return {
    planner: t.planner,
    summary: summary(t),
    totalMin: mins(t.departIso, t.arriveIso),
    alternatives: t.alternatives.map((a) => ({ tripId: a.id, summary: summary(a), depart: a.departIso, arrive: a.arriveIso, totalMin: mins(a.departIso, a.arriveIso), arrivesLaterByMin: mins(t.arriveIso, a.arriveIso) })),
    tripId: t.id,
    depart: t.departIso,
    arrive: t.arriveIso,
    legs: t.legs.map((l) => ("durationS" in l ? `${l.label} (${Math.round(l.durationS / 60)} min)` : l.label)),
    routes: t.routes,
    weather: t.weather,
    plannedWork: t.alerts,
    skippedStops: t.skips.length ? t.skips.map((s) => `${s.route}${s.toward ? ` (${s.toward}-bound)` : ""} skips ${s.name}`) : undefined,
    elevatorOutages: t.elevators,
    hazards: t.hazards,
    exitAdvice: t.exitAdvice,
    /** Present for a trip planned ahead: say it, so nobody expects live delays for tomorrow. */
    whenNote: t.scheduled?.note,
    roadNotes: t.context.map((c) => c.text),
    missingData: t.mode === "drive" ? t.stubbed : undefined,
  };
}
