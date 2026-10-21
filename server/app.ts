/**
 * The app's HTTP API as one portable Hono app. Handlers in api/ are plain
 * Web-standard `GET(Request): Promise<Response>` functions, so this runs
 * unchanged on Node (server/node.ts, Docker), Cloudflare Workers, Bun or Deno,
 * and inside the Vite dev server (vite.config.ts). No host-specific code.
 */
import { Hono } from "hono";
import { compress } from "hono/compress";
import * as aggregate from "../api/aggregate";
import * as area from "../api/area/[block]";
import * as areas from "../api/areas";
import * as blockTiles from "../api/block-tiles";
import * as blocks from "../api/blocks";
import * as cityTiles from "../api/city-tiles";
import * as restrooms from "../api/restrooms";
import * as sources from "../api/sources";
import * as street from "../api/street";

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

export const app = new Hono();
// Rollups and boundaries are 0.2-2 MB of JSON; gzip cuts them ~5x.
app.use("/api/*", async (c, next) => {
  // Tile ranges are already-compressed binary; gzip would break Content-Range.
  if (c.req.path === "/api/city-tiles" || c.req.path === "/api/block-tiles") return next();
  return compress()(c, next);
});
for (const [path, handler] of routes) app.get(path, (c) => handler.GET(c.req.raw));
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
