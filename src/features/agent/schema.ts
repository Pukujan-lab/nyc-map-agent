import { z } from "zod";
import { filterPatch } from "../../lib/map/filterPatch";
import { SAVED_LAT_MAX, SAVED_LAT_MIN, SAVED_LON_MAX, SAVED_LON_MIN } from "../../lib/map/savedSpot";

export { filterPatch };
export type { FilterPatch } from "../../lib/map/filterPatch";

/**
 * The agent's wire contract, shared by server/features/agent (producer) and the
 * client executor (consumer). zod only, so both sides import it safely.
 */
export const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLatTuple = z.infer<typeof lngLat>;

export const callout = z.object({ at: lngLat, text: z.string() });

export const stationRef = z.object({ id: z.string(), name: z.string(), lon: z.number(), lat: z.number() });

/** A station entrance or exit from MTA "Subway Entrances and Exits" (data.ny.gov i9wp-a4ja). */
export const portal = z.object({
  lon: z.number(),
  lat: z.number(),
  /** Plain words: "NE exit near E 42 St & Lexington Av". */
  label: z.string(),
  type: z.string(),
  elevatorOnly: z.boolean().default(false),
  /** Active elevator/escalator outage text at this station, if any. */
  outage: z.string().nullable().default(null),
});

export const walkLeg = z.object({
  kind: z.enum(["walk", "transfer"]),
  label: z.string(),
  coords: z.array(lngLat).min(2),
  durationS: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  turns: z.array(callout).default([]),
});

export const enterLeg = z.object({ kind: z.literal("enter"), station: stationRef, portal, label: z.string() });
export const exitLeg = z.object({ kind: z.literal("exit"), station: stationRef, portal, label: z.string() });

export const rideLeg = z.object({
  kind: z.literal("ride"),
  route: z.string(),
  label: z.string(),
  coords: z.array(lngLat).min(2),
  durationS: z.number().nonnegative(),
  stops: z.array(callout).default([]),
  /** Underground → x-ray buildings; elevated → normal 3D city (the viaduct). */
  underground: z.boolean(),
  /** "gtfs-shape" when the transit feature supplies one, else "straight-line" (stub). */
  geometrySource: z.enum(["gtfs-shape", "straight-line"]),
  /** Vehicle type; bus/rail/ferry legs come from the OTP planner. */
  mode: z.enum(["subway", "bus", "rail", "ferry", "tram"]).default("subway"),
  /** Boarding and alighting stop names, and stops ridden (alighting stop included). */
  fromStop: z.string().optional(),
  toStop: z.string().optional(),
  numStops: z.number().int().nonnegative().optional(),
  /** Route colour from GTFS, "#RRGGBB". */
  color: z.string().optional(),
  headsign: z.string().optional(),
});

export const driveLeg = walkLeg.extend({ kind: z.literal("drive") });

export const leg = z.discriminatedUnion("kind", [
  driveLeg,
  walkLeg.extend({ kind: z.literal("walk") }),
  walkLeg.extend({ kind: z.literal("transfer") }),
  enterLeg,
  rideLeg,
  exitLeg,
]);
export type Leg = z.infer<typeof leg>;

export const weatherChip = z.object({ time: z.string(), tempC: z.number(), precipPct: z.number(), summary: z.string() });

export const tripMode = z.enum(["walk", "transit", "drive"]);
export type TripMode = z.infer<typeof tripMode>;

/** Sourced driving context lines (traffic speeds, closures, tolls, cameras, crash hotspots, parking). */
export const contextNote = z.object({
  kind: z.enum(["slow", "closure", "advisory", "event", "toll", "camera", "crashes", "parking"]),
  text: z.string(),
  at: lngLat.optional(),
});

export const tripBase = z.object({
  id: z.string(),
  mode: tripMode.default("transit"),
  origin: z.object({ label: z.string(), at: lngLat }),
  destination: z.object({ label: z.string(), at: lngLat }),
  departIso: z.string(),
  arriveIso: z.string(),
  legs: z.array(leg).min(1),
  routes: z.array(z.string()),
  /** Planned work / service alerts active at departure on the ride routes. */
  alerts: z.array(z.string()).default([]),
  /** Elevator/escalator outages at the stations used. */
  elevators: z.array(z.string()).default([]),
  /** NWS alerts at the origin. */
  hazards: z.array(z.string()).default([]),
  weather: weatherChip.nullable().default(null),
  exitAdvice: z.string().nullable().default(null),
  context: z.array(contextNote).default([]),
  stubbed: z.array(z.string()).default([]),
  /** "otp" when OpenTripPlanner planned it, "fallback" for the built-in subway router. */
  planner: z.enum(["otp", "fallback"]).optional(),
});
/** A trip plus up to two alternative itineraries (themselves without alternatives). */
export const trip = tripBase.extend({ alternatives: z.array(tripBase).max(4).default([]) });
export type TripCore = z.infer<typeof tripBase>;
export type Trip = z.infer<typeof trip>;

/** One saved home or work spot the browser sends with a question. */
export const savedSpot = z.object({
  label: z.string().min(1).max(80),
  lon: z.number().min(SAVED_LON_MIN).max(SAVED_LON_MAX),
  lat: z.number().min(SAVED_LAT_MIN).max(SAVED_LAT_MAX),
});

/** Structured map commands the model returns and the client executes. Keep it small. */
export const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flyTo"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), zoom: z.number().min(9).max(20).optional() }),
  z.object({ type: z.literal("showRoute"), trip }),
  z.object({ type: z.literal("openPanel"), trip }),
  z.object({ type: z.literal("enterStreetView"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }),
  z.object({ type: z.literal("playFlythrough"), trip, speed: z.union([z.literal(2), z.literal(10), z.literal(30)]).default(10) }),
  z.object({ type: z.literal("setTime"), iso: z.string() }),
  z.object({ type: z.literal("setFilters"), filters: filterPatch }),
]);
export type AgentCommand = z.infer<typeof command>;

/** One NDJSON line streamed by POST /api/agent. */
export const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool"), name: z.string() }),
  z.object({ type: z.literal("command"), command }),
  z.object({
    type: z.literal("done"),
    model: z.string(),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type StreamEvent = z.infer<typeof streamEvent>;

/** Where the question was asked from (street view). Used for this request only; never stored. */
export const askContext = z.object({
  source: z.literal("street-view"),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  heading: z.number().min(0).max(360).nullable().default(null),
  nearestStation: z.string().max(200).nullable().default(null),
  nearestEntrance: z.string().max(200).nullable().default(null),
  followedTrain: z.string().max(100).nullable().default(null),
});
export type AskContext = z.infer<typeof askContext>;

export const requestBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(30),
  /** Browser geolocation, only when the user granted it. */
  location: z.object({ lon: z.number(), lat: z.number() }).nullable().default(null),
  /** The mode chip (Walk / Transit / Drive); the model treats it as a preference. */
  mode: tripMode.default("transit"),
  /** Client clock, so "tomorrow 9am" resolves in the user's zone. */
  now: z.string().optional(),
  context: askContext.optional(),
  /** Saved home and work for this question. The server does not store them. */
  places: z.object({
    home: savedSpot.nullable().optional(),
    work: savedSpot.nullable().optional(),
  }).optional(),
});
export type AgentRequest = z.infer<typeof requestBody>;
