import { tool } from "ai";
import { z } from "zod";
import { command, filterPatch, type AgentCommand, type LngLatTuple, type Trip } from "../../../src/features/agent/schema";
import type { SavedSpot } from "../../../src/lib/map/savedSpot";
import { elevatorStatus, geocode, hazardsAt, routeWalk, weatherAt, type Place } from "./services";
import { buildDriveTrip } from "./drive/trip";
import type { DriveRouter } from "./drive/router";
import { tripBrief } from "./trip";
import { planTrip, type PlanDeps } from "./plan";

export interface ToolContext {
  location: { lon: number; lat: number } | null;
  emit: (c: AgentCommand) => void;
  deps?: PlanDeps & { driveRouter?: DriveRouter };
  /** Driving sub-module flag (agentDrive). */
  drive?: boolean;
  /** Saved home and work for this question only. */
  places?: { home?: SavedSpot | null; work?: SavedSpot | null };
}

/** "home" and "work" resolve to the saved spots. Null means the word is not a saved place. */
export function savedSpotFor(text: string, places: ToolContext["places"]): { label: string; at: LngLatTuple } | "missing" | null {
  const key = text.trim().toLowerCase();
  if (key !== "home" && key !== "work") return null;
  const spot = places?.[key];
  if (!spot) return "missing";
  return { label: spot.label, at: [spot.lon, spot.lat] };
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
  elevator_status: z.object({ station: z.string().min(2) }),
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
    const saved = savedSpotFor(text, ctx.places);
    if (saved === "missing") throw new Error(`No ${text.trim().toLowerCase()} is saved. Tell them to open Layers and filters and tap Save ${text.trim().toLowerCase()} here.`);
    if (saved) return saved;
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

  return {
    geocode: tool({ description: "Find an NYC address or landmark.", inputSchema: args.geocode, execute: async ({ text }) => resolve(text) }),
    route_walk: tool({
      description: "Walking route (OSRM) between two places.",
      inputSchema: args.route_walk,
      execute: async ({ from, to }) => {
        const w = await routeWalk(at(await resolve(from)), at(await resolve(to)));
        return { minutes: Math.round(w.durationS / 60), meters: Math.round(w.distanceM), turns: w.turns.slice(0, 8).map((t) => t.text) };
      },
    }),
    transit_plan: tool({
      description: "Door-to-door public transit search across subway, bus (incl. SBS), LIRR, Metro-North, ferry and SIR: the best itinerary plus up to 2 alternatives (each with depart/arrive, legs, stops), weather, planned work, elevator outages, recommended exit. Returns a tripId for map tools.",
      inputSchema: args.transit_plan,
      execute: async ({ from, to, depart, arriveBy }) => {
        const [o, d] = await Promise.all([resolve(from), resolve(to)]);
        const t = await planTrip(o, d, depart, arriveBy, ctx.deps);
        trips.set(t.id, t);
        for (const a of t.alternatives) trips.set(a.id, { ...a, alternatives: [] });
        return tripBrief(t);
      },
    }),
    ...(ctx.drive === false ? {} : {
      drive_plan: tool({
        description: "Driving trip (car route) at a time: ETA, turn/lane hints, slow segments (DOT live speeds), closures, events, tolls, crash hotspots, weather. Returns a tripId for map tools.",
        inputSchema: args.drive_plan,
        execute: async ({ from, to, depart }) => {
          const [o, d] = await Promise.all([resolve(from), resolve(to)]);
          const t = await buildDriveTrip(o, d, depart, ctx.deps?.driveRouter);
          trips.set(t.id, t);
          return tripBrief(t);
        },
      }),
    }),
    weather_forecast: tool({ description: "Hourly forecast (Open-Meteo) at a place and local time.", inputSchema: args.weather_forecast, execute: async ({ place, time }) => weatherAt(at(await resolve(place)), time) }),
    hazards: tool({ description: "Active National Weather Service alerts at a place.", inputSchema: args.hazards, execute: async ({ place }) => ({ alerts: await hazardsAt(at(await resolve(place))) }) }),
    elevator_status: tool({ description: "Current MTA elevator/escalator outages at a station.", inputSchema: args.elevator_status, execute: async ({ station }) => ({ outages: await elevatorStatus(station) }) }),
    flyTo: tool({ description: "Map: fly the camera to a place.", inputSchema: args.flyTo, execute: async ({ place, zoom }) => { const p = await resolve(place); return emit({ type: "flyTo", lon: p.at[0], lat: p.at[1], zoom }); } }),
    showRoute: tool({ description: "Map: draw a planned trip.", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "showRoute", trip: tripOf(tripId) }) }),
    openPanel: tool({ description: "Map: open the trip summary panel (weather chip, lines, alerts, elevators, exit, ETA).", inputSchema: args.tripRef, execute: ({ tripId }) => emit({ type: "openPanel", trip: tripOf(tripId) }) }),
    enterStreetView: tool({ description: "Map: drop to street level at a place.", inputSchema: args.enterStreetView, execute: async ({ place }) => { const p = await resolve(place); return emit({ type: "enterStreetView", lon: p.at[0], lat: p.at[1] }); } }),
    playFlythrough: tool({ description: "Map: fast-forward preview flying along a planned trip.", inputSchema: args.playFlythrough, execute: ({ tripId, speed }) => emit({ type: "playFlythrough", trip: tripOf(tripId), speed }) }),
    setTime: tool({ description: "Map: set the time the map shows (for forecasts/planned work).", inputSchema: args.setTime, execute: ({ iso }) => emit({ type: "setTime", iso }) }),
    set_filters: tool({
      description: "Map: change layers and filters. Send only the fields the person asked to change. liveBuses true opens the bus line picker and does not show every bus.",
      inputSchema: filterPatch,
      execute: (filters) => emit({ type: "setFilters", filters }),
    }),
  };
}
