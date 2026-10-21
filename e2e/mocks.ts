import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");

/** Offline basemap: a blank vector style so MapLibre still builds its canvas and our data layers. */
const STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e5e7eb" } }],
});

/**
 * Every request leaves through here: our /api from fixtures (trimmed real Octo
 * output), the basemap style from STYLE, everything else outside is refused,
 * so the test is deterministic and never touches an upstream.
 */
export async function mockNetwork(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === "localhost";
    // The app calls /api/v1/*; /api/* is the server's alias. Serve both.
    const path = url.pathname.replace(/^\/api\/v1\//, "/api/");
    const json = (body: string, status = 200) => route.fulfill({ status, contentType: "application/json", body });
    if (local && path === "/api/areas") return json(fixture("areas-nta"));
    if (local && path === "/api/aggregate") {
      return json(fixture(url.searchParams.get("dataset") === "crashes" ? "aggregate-crashes" : "aggregate-noise"));
    }
    if (local && path === "/api/sources") return json(JSON.stringify({ sources: [] }));
    if (local && path.startsWith("/api/")) return json(JSON.stringify({ error: "not_found" }), 404);
    if (local) return route.continue();
    if (url.hostname === "tiles.openfreemap.org" && url.pathname.startsWith("/styles/")) return json(STYLE);
    if (url.hostname === "geosearch.planninglabs.nyc") return json(JSON.stringify({ features: [] }));
    if (url.hostname === "graph.mapillary.com") return json(JSON.stringify({ data: [] }));
    return route.abort("blockedbyclient");
  });
}
