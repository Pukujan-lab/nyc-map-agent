/**
 * Node entry: the API plus the built SPA from dist/, on one port.
 *
 *   pnpm build && pnpm start        (PORT, default 8080; OCTO_* in the environment)
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api } from "./app";

const root = new Hono();
root.route("/", api);
root.use("/*", serveStatic({ root: "./dist" }));
// Client-side routes fall back to the SPA shell.
root.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: root.fetch, port }, () => console.log(`nyc-map-agent on :${port}`));
