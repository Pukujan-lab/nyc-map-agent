import { z } from "zod";

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
  /** Stations the trip's subway lines skip right now (service alerts, #253), with where they are. */
  skips: z.array(z.object({ route: z.string(), name: z.string(), at: lngLat, toward: z.string().nullable().default(null) })).default([]),
  stubbed: z.array(z.string()).default([]),
  /** "otp" when OpenTripPlanner planned it, "fallback" for the built-in subway router. */
  planner: z.enum(["otp", "fallback"]).optional(),
});
/** A trip plus up to two alternative itineraries (themselves without alternatives). */
export const trip = tripBase.extend({ alternatives: z.array(tripBase).max(4).default([]) });
export type TripCore = z.infer<typeof tripBase>;
export type Trip = z.infer<typeof trip>;

/** Structured map commands the model returns and the client executes. Keep it small. */
export const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flyTo"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), zoom: z.number().min(9).max(20).optional() }),
  z.object({ type: z.literal("showRoute"), trip }),
  z.object({ type: z.literal("openPanel"), trip }),
  z.object({ type: z.literal("enterStreetView"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }),
  z.object({ type: z.literal("playFlythrough"), trip, speed: z.union([z.literal(2), z.literal(10), z.literal(30)]).default(10) }),
  z.object({ type: z.literal("setTime"), iso: z.string() }),
]);
export type AgentCommand = z.infer<typeof command>;

/** A named spot an action draws: a stop, a skipped station, a crash hotspot. */
export const mapPoint = z.object({ at: lngLat, name: z.string() });
export type MapPoint = z.infer<typeof mapPoint>;

export const restroomSpot = z.object({
  name: z.string(),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  distanceM: z.number().nonnegative(),
  status: z.string().nullable().default(null),
  hours: z.string().nullable().default(null),
  accessibility: z.string().nullable().default(null),
  operator: z.string().nullable().default(null),
});
export type RestroomSpot = z.infer<typeof restroomSpot>;

/**
 * A button under an answer that shows it on the map (#371). The server builds
 * these from the tool results it already has, never from the model's words,
 * so a button only ever draws data a tool returned. `id` dedupes repeats.
 */
const actionBase = { id: z.string().max(200), label: z.string().max(80) };
export const mapAction = z.discriminatedUnion("kind", [
  z.object({ ...actionBase, kind: z.literal("flyTo"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), zoom: z.number().min(9).max(20).optional() }),
  z.object({ ...actionBase, kind: z.literal("showRestroom"), restroom: restroomSpot }),
  z.object({ ...actionBase, kind: z.literal("showRoute"), trip }),
  /** A line's stops, or (`skipped`) the stations it is skipping. */
  z.object({ ...actionBase, kind: z.literal("showStops"), route: z.string(), color: z.string().optional(), skipped: z.boolean().default(false), stops: z.array(mapPoint).min(1).max(200) }),
  z.object({ ...actionBase, kind: z.literal("showCrashes"), points: z.array(mapPoint).min(1).max(200) }),
]);
export type MapAction = z.infer<typeof mapAction>;
/** Most buttons one answer carries. */
export const MAX_ACTIONS = 6;

/**
 * One NDJSON line streamed by POST /api/agent. Clients drop lines they cannot
 * parse, so an older client simply ignores the newer "actions" line.
 */
export const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool"), name: z.string() }),
  /**
   * A tool the agent started or finished (#370), for the "Agents working" list.
   * `id` pairs a start with its end. Older clients drop this line.
   */
  z.object({ type: z.literal("step"), id: z.string().max(100), name: z.string().max(100), status: z.enum(["start", "done", "error"]) }),
  z.object({ type: z.literal("command"), command }),
  z.object({ type: z.literal("actions"), actions: z.array(mapAction).max(MAX_ACTIONS) }),
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

/** A BCP 47 language tag as browsers report it ("en-US", "zh-Hans-CN"). */
export const langTag = z.string().max(35).regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/);

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
  /** The browser's language (BCP 47, e.g. "es-US"); the reply follows the question's language, this is the tie-break. */
  lang: langTag.optional(),
});
export type AgentRequest = z.infer<typeof requestBody>;
