/**
 * OpenAPI route table for the API. Each route reuses the handler's own zod
 * Query schema, so the spec (openapi.json, `pnpm openapi`) cannot drift from
 * validation. CI fails if openapi.json is stale and runs oasdiff against main.
 */
import { createRoute, z } from "@hono/zod-openapi";
import pkg from "../package.json";
import { Query as AggregateQuery } from "../api/aggregate";
import { Query as AreasQuery } from "../api/areas";
import { Query as BlocksQuery } from "../api/blocks";
import { Query as StreetQuery } from "../api/street";
import { Query as HazardsQuery } from "./features/hazards/routes";
import { NearQuery as ParkingNearQuery } from "./features/parking/routes";
import { AlongQuery as TrafficAlongQuery } from "./features/traffic/routes";
import { Query as WeatherQuery } from "./features/weather/routes";
import { Query as SegmentsQuery, Response_ as SegmentsResponse } from "./features/transit/segments";
import { EventsResponse, Query as EventsQuery } from "./features/events/schema";
import { PlaceToiletsResponse } from "./features/place-toilets/schema";

const Json = z.record(z.unknown()).openapi("Json");
const ApiError = z.object({ error: z.string(), issues: z.array(z.string()).optional() }).openapi("ApiError");

const errors = {
  400: { description: "Invalid query", content: { "application/json": { schema: ApiError } } },
  502: { description: "Upstream (Octo / R2) error", content: { "application/json": { schema: ApiError } } },
};

const jsonRoute = (path: string, summary: string, query?: z.AnyZodObject, params?: z.AnyZodObject) =>
  createRoute({
    method: "get",
    path,
    summary,
    request: { ...(query ? { query } : {}), ...(params ? { params } : {}) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Json } } }, ...errors },
  });

const binaryRoute = (path: string, summary: string) =>
  createRoute({
    method: "get",
    path,
    summary,
    responses: {
      200: { description: "Whole file", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
      206: { description: "PMTiles byte range (Range header)", content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } } },
      ...errors,
    },
  });

/** POST /api/agent: the smart-mode trip agent. Body mirrors src/features/agent/schema.ts `requestBody`. */
export const AGENT_ROUTE = createRoute({
  method: "post",
  path: "/api/agent",
  summary: "Smart-mode trip agent (NDJSON stream of text, tool and map-command events)",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(30),
              location: z.object({ lon: z.number(), lat: z.number() }).nullable().optional(),
              mode: z.enum(["walk", "transit", "drive"]).optional(),
              now: z.string().optional(),
              context: z
                .object({
                  source: z.literal("street-view"),
                  lon: z.number(),
                  lat: z.number(),
                  heading: z.number().nullable().optional(),
                  nearestStation: z.string().nullable().optional(),
                  nearestEntrance: z.string().nullable().optional(),
                  followedTrain: z.string().nullable().optional(),
                })
                .optional(),
            })
            .openapi("AgentRequest"),
        },
      },
    },
  },
  responses: {
    200: { description: "One JSON StreamEvent per line", content: { "application/x-ndjson": { schema: z.string() } } },
    400: { description: "Invalid body", content: { "application/json": { schema: ApiError } } },
  },
});

/** Hono path (":block") -> route. Order matches server/app.ts. */
export const ROUTES = {
  "/api/aggregate": jsonRoute("/api/aggregate", "Precomputed noise / crash rollup", AggregateQuery),
  "/api/area/:block": jsonRoute(
    "/api/area/{block}",
    "Every source for one block",
    undefined,
    z.object({ block: z.string().openapi({ param: { name: "block", in: "path" }, example: "120:340" }) }),
  ),
  "/api/areas": jsonRoute("/api/areas", "Simplified boundary GeoJSON", AreasQuery),
  "/api/block-tiles": binaryRoute("/api/block-tiles", "Real NYC tax-block PMTiles"),
  "/api/blocks": jsonRoute("/api/blocks", "One row per area for a source", BlocksQuery),
  "/api/city-tiles": binaryRoute("/api/city-tiles", "Citywide 3D-city PMTiles"),
  "/api/vehicle-models/:mode": binaryRoute("/api/vehicle-models/{mode}", "Live-vehicle glTF model (subway, bus, rail)"),
  "/api/restrooms": jsonRoute("/api/restrooms", "Public restrooms GeoJSON"),
  "/api/sources": jsonRoute("/api/sources", "Source registry metadata and freshness"),
  "/api/street": jsonRoute("/api/street", "Street noise / crash stats", StreetQuery),
  "/api/weather": jsonRoute("/api/weather", "Current weather near a point (Open-Meteo, NWS fallback)", WeatherQuery),
  "/api/hazards": jsonRoute("/api/hazards", "Active NWS alerts for NYC and flooded FloodNet sensors", HazardsQuery),
  "/api/ferry": jsonRoute("/api/ferry", "NYC Ferry and Staten Island Ferry routes, piers, and live or estimated vessels"),
  "/api/traffic/along": jsonRoute("/api/traffic/along", "NYC DOT traffic speeds along a line", TrafficAlongQuery),
  "/api/traffic": jsonRoute("/api/traffic", "NYC DOT real-time speed links and today's closures GeoJSON"),
  "/api/parking/near": jsonRoute("/api/parking/near", "Licensed garages and lots near a point", ParkingNearQuery),
  "/api/parking/rules": jsonRoute("/api/parking/rules", "Street parking sign and meter rules near a point", ParkingNearQuery),
  "/api/parking": jsonRoute("/api/parking", "Licensed garages and lots GeoJSON (DCWP + OSM)"),
  "/api/transit-segments": createRoute({
    method: "get",
    path: "/api/transit-segments",
    summary: "Historical subway segment travel and dwell times (median, p80) for a route at an hour of the week",
    request: { query: SegmentsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: SegmentsResponse } } }, ...errors },
  }),
  "/api/transit": jsonRoute("/api/transit", "Live transit capabilities ({ bus })"),
  "/api/transit/:system": jsonRoute(
    "/api/transit/{system}",
    "Live MTA GTFS-rt (subway / lirr / mnr trips, bus positions, alerts + elevator outages), cached ~15 s; bus-trip?vehicle= (one bus's headsign + upcoming stops) and bus-route?route= (route shape + stops)",
    z.object({ vehicle: z.string().max(40).optional(), route: z.string().max(8).optional() }),
    z.object({ system: z.enum(["subway", "lirr", "mnr", "bus", "alerts", "bus-trip", "bus-route"]).openapi({ param: { name: "system", in: "path" }, example: "subway" }) }),
  ),
  "/api/events": createRoute({
    method: "get",
    path: "/api/events",
    summary: "NYC pop-up events, street fairs, markets, outdoor shows, Parks events and event closures (GeoJSON), refreshed nightly",
    request: { query: EventsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: EventsResponse } } }, ...errors },
  }),
  "/api/place-toilets": createRoute({
    method: "get",
    path: "/api/place-toilets",
    summary: "Restaurants, cafés, bars and shops with a toilet, labelled anyone / customers only (OpenStreetMap, ODbL; GeoJSON, refreshed nightly)",
    responses: { 200: { description: "OK", content: { "application/json": { schema: PlaceToiletsResponse } } }, ...errors },
  }),
} as const;

/**
 * OpenAPI info. `version` is the package version (release-please bumps it), so
 * the spec says which release it describes; CI (oasdiff) requires a major bump
 * for any breaking change.
 */
export const API_INFO = { title: "NYC Map Agent API", version: pkg.version };

/** "/api/x" -> "/api/v1/x" (the canonical, versioned path). */
export const toV1 = (path: string): string => path.replace(/^\/api\//, "/api/v1/");

type AnyRoute = ReturnType<typeof createRoute>;

/** The same route at its /api/v1 path. */
export function toV1Route<R extends AnyRoute>(route: R): R {
  return { ...route, path: toV1(route.path) };
}

/** The unversioned /api/* alias: identical behaviour, flagged deprecated in the spec. */
export function legacyAlias<R extends AnyRoute>(route: R): R {
  return { ...route, deprecated: true, summary: `${route.summary ?? ""} (alias of ${toV1(route.path)})`.trim() };
}
