/**
 * The app's HTTP API as one portable Hono app. Handlers in api/ are plain
 * Web-standard `GET(Request): Promise<Response>` functions, so this runs
 * unchanged on Node (server/node.ts, Docker), Cloudflare Workers, Bun or Deno,
 * and inside the Vite dev server (vite.config.ts). No host-specific code.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { compress } from "hono/compress";
import { ROUTES } from "./openapi";
import * as aggregate from "../api/aggregate";
import * as area from "../api/area/[block]";
import * as areas from "../api/areas";
import * as blockTiles from "../api/block-tiles";
import * as blocks from "../api/blocks";
import * as cityTiles from "../api/city-tiles";
import * as restrooms from "../api/restrooms";
import * as sources from "../api/sources";
import * as street from "../api/street";
import * as agent from "./features/agent/routes";

type Handler = { GET: (request: Request) => Promise<Response> };

const routes: Array<[string, Handler]> = [
  ["/api/aggregate", aggregate],
  ["/api/area/:block", area],
  ["/api/areas", areas],
  ["/api/block-tiles", blockTiles],
  ["/api/blocks", blocks],
  ["/api/city-tiles", cityTiles],
  ["/api/restrooms", restrooms],
  ["/api/sources", sources],
  ["/api/street", street],
];

export const app = new OpenAPIHono({
  // Same 400 shape as api/_lib/http.ts parseQuery.
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "invalid_query", issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        400,
        { "cache-control": "no-store" },
      );
    }
  },
});
// Rollups and boundaries are 0.2-2 MB of JSON; gzip cuts them ~5x.
app.use("/api/*", async (c, next) => {
  // Tile ranges are already-compressed binary; gzip would break Content-Range.
  if (c.req.path === "/api/city-tiles" || c.req.path === "/api/block-tiles" || c.req.path === "/api/agent") return next();
  return compress()(c, next);
});
for (const [path, handler] of routes) {
  const spec = (ROUTES as Record<string, (typeof ROUTES)[keyof typeof ROUTES]>)[path];
  if (spec) {
    // Handlers build their own Response; the route only adds validation + docs.
    app.openapi(spec, ((c: Context) => handler.GET(c.req.raw)) as never);
  } else {
    app.get(path, (c) => handler.GET(c.req.raw));
  }
}

/** Every mounted path; scripts/openapi.ts fails if one has no spec in server/openapi.ts. */
export const MOUNTED_PATHS = routes.map(([path]) => path);

// Smart-mode agent (POST, NDJSON stream; body validated by zod in the handler). Skips gzip above.
app.post("/api/agent", (c) => agent.POST(c.req.raw));

app.doc31("/api/openapi.json", { openapi: "3.1.0", info: { title: "NYC Map Agent API", version: "1" } });
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
export type AppType = typeof app;
