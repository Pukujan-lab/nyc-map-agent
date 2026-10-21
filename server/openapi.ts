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
  "/api/restrooms": jsonRoute("/api/restrooms", "Public restrooms GeoJSON"),
  "/api/sources": jsonRoute("/api/sources", "Source registry metadata and freshness"),
  "/api/street": jsonRoute("/api/street", "Street noise / crash stats", StreetQuery),
} as const;
