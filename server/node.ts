/**
 * Node entry: the API plus the built SPA from dist/, on one port.
 *
 *   pnpm build && pnpm start        (PORT, default 8080; OCTO_* in the environment)
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api } from "./app";

/** Exported so tests can exercise routing without binding a port. */
export function createRoot(): Hono {
  const root = new Hono();
  // Before the SPA fallback, so a health check never receives index.html.
  root.get("/healthz", (c) => c.json({ ok: true }));
  root.route("/", api);
  root.use("/*", serveStatic({ root: "./dist" }));
  // Client-side routes fall back to the SPA shell.
  root.get("*", serveStatic({ path: "./dist/index.html" }));
  return root;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: createRoot().fetch, port }, () => console.log(`nyc-map-agent on :${port}`));
}
