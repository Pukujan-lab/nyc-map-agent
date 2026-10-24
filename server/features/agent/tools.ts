import { tool } from "ai";
import { z } from "zod";
import { command, type AgentCommand, type LngLatTuple, type MapAction, type Trip } from "../../../src/features/agent/schema";
import { elevatorStatus, geocode, hazardsAt, nearestRestrooms, publicRestrooms, routeWalk, serviceAlerts, subwayAlertEntities, subwayVehicles, troubleStations, weatherAt, type Place, type RestroomRow } from "./services";
import { placeActions, restroomActions, troubleActions, tripActions } from "./mapActions";
import { buildDriveTrip } from "./drive/trip";
import type { DriveRouter } from "./drive/router";
import { safe, toNyLocal, tripBrief } from "./trip";
import { openDataEntrances, type Station } from "./transit";
import { lineTroubles, otherLinesAt, stuckTrains, troubleSummary, type FeedAlert, type LiveVehicle } from "../../../src/lib/transit/trouble";
import { planTrip, type PlanDeps } from "./plan";
import { withSources, type SourceLedger } from "./freshness";

export interface ToolContext {
  location: { lon: number; lat: number } | null;
  emit: (c: AgentCommand) => void;
  deps?: PlanDeps & {
    driveRouter?: DriveRouter;
    restrooms?: () => Promise<RestroomRow[]>;
    alerts?: typeof serviceAlerts;
    /** MTA trouble inputs (#361), injectable for tests. */
    alertEntities?: () => Promise<FeedAlert[]>;
    vehicles?: (routes: string[]) => Promise<LiveVehicle[]>;
    now?: () => number;
  };
  /** The followed vehicle key from street view ("subway:<trip id>"), to say whether that train is the stuck one. */
  followedTrain?: string | null;
  /** Driving sub-module flag (agentDrive). */
  drive?: boolean;
  /** Map action buttons built from tool results (#371). */
  actions?: (a: MapAction[]) => void;
  /** The request's source ledger: every data tool's feeds and their age (#375). */
  sources?: SourceLedger;
}

/** Tool argument schemas, exported for tests. "here" means the user's location. */
export const args = {
  geocode: z.object({ text: z.string().min(2).describe("NYC address, landmark or 'here'") }),
  route_walk: z.object({ from: z.string(), to: z.string() }),
  transit_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d/).describe("Local New York time, e.g. 2026-10-22T09:00: leave at, or arrive by when arriveBy is true"),
    arriveBy: z.boolean().default(false).describe("true when the user must arrive by that time"),
  }),
  weather_forecast: z.object({ place: z.string().default("here"), time: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d/) }),
  hazards: z.object({ place: z.string().default("here") }),
  nearest_restroom: z.object({ place: z.string().default("here") }),
  elevator_status: z.object({ station: z.string().min(2) }),
  line_status: z.object({ lines: z.array(z.string().regex(/^[A-Za-z0-9]{1,3}$/)).min(1).max(6).describe("Subway lines as the MTA names them, e.g. [\"L\"] or [\"4\",\"5\",\"6\"]") }),
  flyTo: z.object({ place: z.string(), zoom: z.number().min(9).max(20).optional() }),
  tripRef: z.object({ tripId: z.string() }),
  enterStreetView: z.object({ place: z.string() }),
  playFlythrough: z.object({ tripId: z.string(), speed: z.union([z.literal(2), z.literal(10), z.literal(30)]).default(10) }),
  drive_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d/).describe("Local New York time"),
  }),
  setTime: z.object({ iso: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d/) }),
};

export function makeTools(ctx: ToolContext) {
  const trips = new Map<string, Trip>();
  const resolve = async (text: string): Promise<Place> => {
    if (/^(here|my location|current location|me)$/i.test(text.trim())) {
      if (!ctx.location) throw new Error("Location permission not granted; ask the user where they are starting.");
      return { label: "your location", at: [ctx.location.lon, ctx.location.lat] };
    }
    const p = await geocode(text);
    if (!p) throw new Error(`Could not find "${text}" in NYC.`);
    return p;
  };
  const tripOf = (id: string) => {
    const t = trips.get(id);
    if (!t) throw new Error("Unknown tripId; call transit_plan first.");
    return t;
  };
  const emit = (c: AgentCommand) => { ctx.emit(command.parse(c)); return { ok: true }; };
  const at = (p: Place): LngLatTuple => p.at;
  const offer = (a: MapAction[]) => ctx.actions?.(a);
  /** A data tool: its result says which feeds it read and how old each is, so the model can say so (#375). */
  const sourced = <A, R extends object>(fn: (input: A) => Promise<R>) => async (input: A) => {
    const { value, sources } = await withSources(ctx.sources, () => fn(input));
    if (!sources.length) return value;
    return { ...value, sources: sources.map((s) => ({ source: s.label, asOf: s.asOf ? toNyLocal(new Date(s.asOf)) : "unknown", ...(s.stale ? { stale: true } : {}), ...(s.note ? { note: s.note } : {}) })) };
  };

  return {
    geocode: tool({ description: "Find an NYC address or landmark.", inputSchema: args.geocode, execute: async ({ text }) => { const p = await resolve(text); offer(placeActions(p)); return p; } }),
    route_walk: tool({
      description: "Walking route (OSRM) between two places.",
      inputSchema: args.route_walk,
      execute: async ({ from, to }) => {
        const dest = await resolve(to);
        const w = await routeWalk(at(await resolve(from)), at(dest));
        offer(placeActions(dest));
        return { minutes: Math.round(w.durationS / 60), meters: Math.round(w.distanceM), turns: w.turns.slice(0, 8).map((t) => t.text) };
      },
    }),
    transit_plan: tool({
      description: "Door-to-door public transit search across subway, bus (incl. SBS), LIRR, Metro-North, ferry and SIR: the best itinerary plus up to 2 alternatives (each with depart/arrive, legs, stops), weather, planned work, elevator outages, recommended exit. Returns a tripId for map tools.",
      inputSchema: args.transit_plan,
      execute: sourced(async ({ from, to, depart, arriveBy }: z.infer<typeof args.transit_plan>) => {
        const [o, d] = await Promise.all([resolve(from), resolve(to)]);
        const t = await planTrip(o, d, depart, arriveBy, ctx.deps);
        trips.set(t.id, t);
        for (const a of t.alternatives) trips.set(a.id, { ...a, alternatives: [] });
        offer(tripActions(t));
        return tripBrief(t);
      }),
    }),
    ...(ctx.drive === false ? {} : {
      drive_plan: tool({
        description: "Driving trip (car route) at a time: ETA, turn/lane hints, slow segments (DOT live speeds), closures, events, tolls, crash hotspots, weather. Returns a tripId for map tools.",
        inputSchema: args.drive_plan,
        execute: sourced(async ({ from, to, depart }: z.infer<typeof args.drive_plan>) => {
          const [o, d] = await Promise.all([resolve(from), resolve(to)]);
          const t = await buildDriveTrip(o, d, depart, ctx.deps?.driveRouter);
          trips.set(t.id, t);
          offer(tripActions(t));
          return tripBrief(t);
        }),
      }),
    }),
    nearest_restroom: tool({
      description: "Closest public restrooms (NYC Open Data) to a place, open ones first: name, distance in meters, status, hours, accessibility.",
      inputSchema: args.nearest_restroom,
      execute: sourced(async ({ place }: z.infer<typeof args.nearest_restroom>) => {
        const spots = nearestRestrooms(await (ctx.deps?.restrooms ?? publicRestrooms)(), at(await resolve(place)));
        offer(restroomActions(spots));
        // Coordinates stay out of the model's view; the button carries them.
        return { restrooms: spots.map((r) => ({ name: r.name, distanceM: r.distanceM, status: r.status, hours: r.hours, accessibility: r.accessibility, operator: r.operator })) };
      }),
    }),
    line_status: tool({
      description: "Live MTA subway trouble right now for the given lines: what is wrong and at which station, skipped stations, shuttle buses (where they run, where to board, where to get the train back), stations where the MTA says to switch direction, other lines at skipped stations, and trains not moving on a delayed line. Subway only: no buses, LIRR or Metro-North.",
      inputSchema: args.line_status,
      execute: sourced(async ({ lines }: z.infer<typeof args.line_status>) => {
        const routes = [...new Set(lines.map((l) => l.toUpperCase()))];
        const nowS = Math.floor((ctx.deps?.now?.() ?? Date.now()) / 1000);
        const [alerts, feed] = await Promise.all([
          (ctx.deps?.alerts ?? serviceAlerts)(routes, nowS),
          safe((ctx.deps?.alertEntities ?? subwayAlertEntities)(), [] as FeedAlert[]),
        ]);
        // Stations only matter when an alert names one of these lines.
        const touched = feed.some((a) => a.alert.informed_entity?.some((e) => e.route_id && routes.includes(e.route_id)));
        const stations = touched ? troubleStations(await safe((ctx.deps?.entrances ?? openDataEntrances).stations(), [] as Station[])) : [];
        const troubles = lineTroubles(feed, stations, routes, nowS);
        const delayed = [...new Set(troubles.filter((t) => t.kind === "delay").map((t) => t.route))];
        const vehicles = delayed.length ? await safe((ctx.deps?.vehicles ?? subwayVehicles)(delayed), [] as LiveVehicle[]) : [];
        const stuck = stuckTrains(vehicles, troubles, stations, nowS);
        offer(troubleActions(troubles, stuck));
        const followed = ctx.followedTrain?.replace(/^subway:/, "") ?? null;
        const followedSeen = followed ? vehicles.find((v) => v.tripId === followed) : undefined;
        return {
          lines: routes,
          alerts,
          trouble: troubles.slice(0, 8).map((t) => ({
            line: t.route,
            kind: t.kind,
            summary: troubleSummary(t),
            ...(t.skipped.length ? { otherLinesAtSkippedStations: Object.fromEntries(t.skipped.slice(0, 4).map((s) => [s.name, otherLinesAt(s, troubles, stations).filter((r) => r !== t.route)])) } : {}),
          })),
          ...(stuck.length ? { trainsNotMoving: stuck.slice(0, 5).map((s) => ({ line: s.route, toward: s.toward, station: s.station.name, stoppedAtStation: s.stopped, minutesWithoutMoving: s.stoppedMin, ...(s.tripId === followed ? { isTheTrainTheUserFollows: true } : {}) })) } : {}),
          ...(followedSeen && !stuck.some((s) => s.tripId === followed) ? { followedTrain: "moving normally per the live feed" } : {}),
          ...(alerts.length || troubles.length ? {} : { note: "The MTA feed has no active alerts for these lines." }),
        };
      }),
    }),
    weather_forecast: tool({ description: "Hourly forecast (Open-Meteo) at a place and local time, up to 7 days ahead.", inputSchema: args.weather_forecast, execute: sourced(async ({ place, time }: z.infer<typeof args.weather_forecast>) => weatherAt(at(await resolve(place)), time)) }),
    hazards: tool({ description: "Active National Weather Service alerts at a place.", inputSchema: args.hazards, execute: sourced(async ({ place }: z.infer<typeof args.hazards>) => ({ alerts: await hazardsAt(at(await resolve(place))) })) }),
    elevator_status: tool({ description: "Current MTA elevator/escalator outages at a station.", inputSchema: args.elevator_status, execute: sourced(async ({ station }: z.infer<typeof args.elevator_status>) => ({ outages: await elevatorStatus(station) })) }),
    flyTo: tool({ description: "Map: fly the camera to a place.", inputSchema: args.flyTo, execute: async ({ place, zoom }) => { const p = await resolve(place); offer(placeActions(p)); return emit({ type: "flyTo", lon: p.at[0], lat: p.at[1], zoom }); } }),
    showRoute: tool({ description: "Map: draw a planned trip.", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "showRoute", trip: tripOf(tripId) }) }),
    openPanel: tool({ description: "Map: open the trip summary panel (weather chip, lines, alerts, elevators, exit, ETA).", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "openPanel", trip: tripOf(tripId) }) }),
    enterStreetView: tool({ description: "Map: drop to street level at a place.", inputSchema: args.enterStreetView, execute: async ({ place }) => { const p = await resolve(place); return emit({ type: "enterStreetView", lon: p.at[0], lat: p.at[1] }); } }),
    playFlythrough: tool({ description: "Map: fast-forward preview flying along a planned trip.", inputSchema: args.playFlythrough, execute: ({ tripId, speed }) => emit({ type: "playFlythrough", trip: tripOf(tripId), speed }) }),
    setTime: tool({ description: "Map: set the time the map shows (for forecasts/planned work).", inputSchema: args.setTime, execute: ({ iso }) => emit({ type: "setTime", iso }) }),
  };
}
