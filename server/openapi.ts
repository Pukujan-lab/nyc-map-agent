/**
 * OpenAPI route table for the API. Each route reuses the handler's own zod
 * Query schema, so the spec (openapi.json, `pnpm openapi`) cannot drift from
 * validation. CI fails if openapi.json is stale and runs oasdiff against main.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { Query as AggregateQuery } from "../api/aggregate";
import { Query as AreasQuery } from "../api/areas";
import { Query as BlocksQuery } from "../api/blocks";
import { Query as StreetQuery } from "../api/street";
import { Query as HazardsQuery } from "./features/hazards/routes";
import { NearQuery as ParkingNearQuery } from "./features/parking/routes";
import { AlongQuery as TrafficAlongQuery } from "./features/traffic/routes";
import { Query as WeatherQuery } from "./features/weather/routes";

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
  "/api/traffic/along": jsonRoute("/api/traffic/along", "NYC DOT traffic speeds along a line", TrafficAlongQuery),
  "/api/traffic": jsonRoute("/api/traffic", "NYC DOT real-time speed links and today's closures GeoJSON"),
  "/api/parking/near": jsonRoute("/api/parking/near", "Licensed garages and lots near a point", ParkingNearQuery),
  "/api/parking/rules": jsonRoute("/api/parking/rules", "Street parking sign and meter rules near a point", ParkingNearQuery),
  "/api/parking": jsonRoute("/api/parking", "Licensed garages and lots GeoJSON (DCWP + OSM)"),
  "/api/transit": jsonRoute("/api/transit", "Live transit capabilities ({ bus })"),
  "/api/transit/:system": jsonRoute(
    "/api/transit/{system}",
    "Live MTA GTFS-rt (subway / lirr / mnr trips, bus positions, alerts + elevator outages), cached ~15 s; bus-trip?vehicle= (one bus's headsign + upcoming stops) and bus-route?route= (route shape + stops)",
    z.object({ vehicle: z.string().max(40).optional(), route: z.string().max(8).optional() }),
    z.object({ system: z.enum(["subway", "lirr", "mnr", "bus", "alerts", "bus-trip", "bus-route"]).openapi({ param: { name: "system", in: "path" }, example: "subway" }) }),
  ),
} as const;
