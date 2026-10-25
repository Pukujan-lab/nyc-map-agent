/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

// `URL.pathname` is percent-encoded, so a project under a path with a space
// (e.g. "Application Support") would otherwise resolve to a missing directory.
const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname);

/**
 * Dev only: serves the same Hono API (server/app.ts) that `pnpm start` runs,
 * inside the Vite dev server, so `pnpm dev` needs no second process. Set
 * API_PROXY_TARGET to proxy /api to another running instance instead.
 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      for (const [k, v] of Object.entries(env)) if (k.startsWith("OCTO_") || k.startsWith("INFERHUB_") || k === "MTA_BUSTIME_KEY") process.env[k] ??= v;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          const { app } = (await server.ssrLoadModule("/server/app.ts")) as {
            app: { fetch: (r: Request) => Response | Promise<Response> };
          };
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const chunks: Buffer[] = [];
          if (req.method !== "GET" && req.method !== "HEAD") for await (const c of req) chunks.push(c as Buffer);
          const response = await app.fetch(
            new Request(new URL(req.url, "http://localhost"), {
              method: req.method,
              headers,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          // Stream (the agent route is NDJSON); other routes are one chunk anyway.
          if (!response.body) return res.end();
          const reader = response.body.getReader();
          for (let r = await reader.read(); !r.done; r = await reader.read()) res.write(r.value);
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.API_PROXY_TARGET;
  return {
    plugins: [react(), ...(proxyTarget ? [] : [devApi(env)])],
    // `MAPILLARY_` is exposed so a plain `MAPILLARY_TOKEN` (the name Mapillary's
    // own docs use) works as well as `VITE_MAPILLARY_TOKEN`. Mapillary client
    // tokens are browser tokens by design. Server secrets such as
    // INFERHUB_API_KEY and OCTO_API_KEY match neither prefix and stay out of the bundle.
    envPrefix: ["VITE_", "MAPILLARY_"],
    resolve: {
      alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
    },
    worker: {
      format: "es",
    },
    server: {
      host: true,
      proxy: proxyTarget ? { "/api": { target: proxyTarget, changeOrigin: true } } : undefined,
    },
    // Route tests share one client address; the live 5-second cooldown would refuse their back-to-back questions.
    // Tests that check the limits build their own limiter.
    test: { env: { AGENT_RATE_BURST_MAX: "0" } },
  };
});
