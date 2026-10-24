import { tool } from "ai";
import { z } from "zod";
import { command, playbackSpeed, type AgentCommand, type LngLatTuple, type MapAction, type Trip } from "../../../src/features/agent/schema";
import { elevatorStatus, geocode, hazardsAt, nearestRestrooms, publicRestrooms, routeWalk, weatherAt, type Place, type RestroomRow } from "./services";
import { placeActions, restroomActions, tripActions } from "./mapActions";
import { buildDriveTrip } from "./drive/trip";
import type { DriveRouter } from "./drive/router";
import { tripBrief } from "./trip";
import { planTrip, type PlanDeps } from "./plan";
import { parseWhen, scheduleFor } from "./when";

export interface ToolContext {
  location: { lon: number; lat: number } | null;
  emit: (c: AgentCommand) => void;
  deps?: PlanDeps & { driveRouter?: DriveRouter; restrooms?: () => Promise<RestroomRow[]> };
  /** Driving sub-module flag (agentDrive). */
  drive?: boolean;
  /** Map action buttons built from tool results (#371). */
  actions?: (a: MapAction[]) => void;
  /** The request's clock, so "tomorrow 9am" resolves against the asker's now. */
  now?: Date;
}

/** A time in the user's words; the server resolves it in New York time (parseWhen). */
const when = z.string().trim().min(1).max(80).default("now");

/** Tool argument schemas, exported for tests. "here" means the user's location. */
export const args = {
  geocode: z.object({ text: z.string().min(2).describe("NYC address, landmark or 'here'") }),
  route_walk: z.object({ from: z.string(), to: z.string() }),
  transit_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: when.describe("When to leave (or arrive by, with arriveBy): the user's own words, e.g. \"tomorrow 9am\", \"now\", or a New York time 2026-10-22T09:00"),
    arriveBy: z.boolean().default(false).describe("true when the user must arrive by that time"),
  }),
  weather_forecast: z.object({ place: z.string().default("here"), time: when }),
  hazards: z.object({ place: z.string().default("here") }),
  nearest_restroom: z.object({ place: z.string().default("here") }),
  elevator_status: z.object({ station: z.string().min(2) }),
  flyTo: z.object({ place: z.string(), zoom: z.number().min(9).max(20).optional() }),
  tripRef: z.object({ tripId: z.string() }),
  enterStreetView: z.object({ place: z.string() }),
  playFlythrough: z.object({ tripId: z.string(), speed: playbackSpeed.default(10) }),
  drive_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: when.describe("When to leave: the user's own words (\"tomorrow 9am\", \"now\") or a New York time 2026-10-22T09:00"),
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
  const now = () => ctx.now ?? new Date();
  const localTime = (words: string): string => {
    const t = parseWhen(words, now());
    if (!t) throw new Error(`Could not read the time "${words}"; pass it as a New York time like 2026-10-22T09:00.`);
    return t;
  };
  /** Mark a trip planned ahead, so the answer and the card say what is known for that time. */
  const schedule = (t: Trip): Trip => {
    const n = now();
    return { ...t, scheduled: scheduleFor(t.departIso, n), alternatives: t.alternatives.map((a) => ({ ...a, scheduled: scheduleFor(a.departIso, n) })) };
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
      execute: async ({ from, to, depart, arriveBy }) => {
        const [o, d] = await Promise.all([resolve(from), resolve(to)]);
        const t = schedule(await planTrip(o, d, localTime(depart), arriveBy, ctx.deps));
        trips.set(t.id, t);
        for (const a of t.alternatives) trips.set(a.id, { ...a, alternatives: [] });
        offer(tripActions(t));
        return tripBrief(t);
      },
    }),
    ...(ctx.drive === false ? {} : {
      drive_plan: tool({
        description: "Driving trip (car route) at a time: ETA, turn/lane hints, slow segments (DOT live speeds), closures, events, tolls, crash hotspots, weather. Returns a tripId for map tools.",
        inputSchema: args.drive_plan,
        execute: async ({ from, to, depart }) => {
          const [o, d] = await Promise.all([resolve(from), resolve(to)]);
          const t = schedule(await buildDriveTrip(o, d, localTime(depart), ctx.deps?.driveRouter));
          trips.set(t.id, t);
          offer(tripActions(t));
          return tripBrief(t);
        },
      }),
    }),
    nearest_restroom: tool({
      description: "Closest public restrooms (NYC Open Data) to a place, open ones first: name, distance in meters, status, hours, accessibility.",
      inputSchema: args.nearest_restroom,
      execute: async ({ place }) => {
        const spots = nearestRestrooms(await (ctx.deps?.restrooms ?? publicRestrooms)(), at(await resolve(place)));
        offer(restroomActions(spots));
        // Coordinates stay out of the model's view; the button carries them.
        return { restrooms: spots.map((r) => ({ name: r.name, distanceM: r.distanceM, status: r.status, hours: r.hours, accessibility: r.accessibility, operator: r.operator })) };
      },
    }),
    weather_forecast: tool({ description: "Hourly forecast (Open-Meteo) at a place and local time.", inputSchema: args.weather_forecast, execute: async ({ place, time }) => weatherAt(at(await resolve(place)), localTime(time)) }),
    hazards: tool({ description: "Active National Weather Service alerts at a place.", inputSchema: args.hazards, execute: async ({ place }) => ({ alerts: await hazardsAt(at(await resolve(place))) }) }),
    elevator_status: tool({ description: "Current MTA elevator/escalator outages at a station.", inputSchema: args.elevator_status, execute: async ({ station }) => ({ outages: await elevatorStatus(station) }) }),
    flyTo: tool({ description: "Map: fly the camera to a place.", inputSchema: args.flyTo, execute: async ({ place, zoom }) => { const p = await resolve(place); offer(placeActions(p)); return emit({ type: "flyTo", lon: p.at[0], lat: p.at[1], zoom }); } }),
    showRoute: tool({ description: "Map: draw a planned trip.", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "showRoute", trip: tripOf(tripId) }) }),
    openPanel: tool({ description: "Map: open the trip summary panel (weather chip, lines, alerts, elevators, exit, ETA).", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "openPanel", trip: tripOf(tripId) }) }),
    enterStreetView: tool({ description: "Map: drop to street level at a place.", inputSchema: args.enterStreetView, execute: async ({ place }) => { const p = await resolve(place); return emit({ type: "enterStreetView", lon: p.at[0], lat: p.at[1] }); } }),
    playFlythrough: tool({ description: "Map: load the fast-forward preview of a planned trip behind a Play button. Only when the user asks to preview or play it; it never starts on its own.", inputSchema: args.playFlythrough, execute: ({ tripId, speed }) => emit({ type: "playFlythrough", trip: tripOf(tripId), speed }) }),
    setTime: tool({ description: "Map: set the time the map shows (for forecasts/planned work).", inputSchema: args.setTime, execute: ({ iso }) => emit({ type: "setTime", iso }) }),
  };
}
