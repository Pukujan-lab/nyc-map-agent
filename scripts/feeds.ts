/**
 * Every upstream the app depends on, as a health probe. Feature modules add
 * their feeds here (e.g. transit: MTA GTFS-rt, Bus Time, alerts, elevators).
 *
 * via "proxy": requested through our Hono API (server/app.ts), so the probe
 *   exercises our route, our Octo/R2 access and the upstream together.
 * via "direct": the browser calls it directly today (keyless public service).
 * optional: the route is not built yet; a 404 is reported as "skipped".
 */
export interface Feed {
  id: string;
  via: "proxy" | "direct";
  /** Path on our API for "proxy", full URL for "direct". */
  url: string;
  init?: RequestInit;
  /** Extra check on a 2xx body. */
  expect?: (body: string) => boolean;
  optional?: boolean;
}

const json = (b: string) => b.trimStart().startsWith("{") || b.trimStart().startsWith("[");

export const FEEDS: Feed[] = [
  // Ours (Octo-backed)
  { id: "octo:areas", via: "proxy", url: "/api/areas?level=nta", expect: json },
  { id: "octo:sources", via: "proxy", url: "/api/sources", expect: json },
  { id: "octo:aggregate", via: "proxy", url: "/api/aggregate?dataset=noise&window=12mo", expect: json },
  { id: "octo:restrooms", via: "proxy", url: "/api/restrooms", expect: json },
  { id: "r2:city-tiles", via: "proxy", url: "/api/city-tiles", init: { headers: { Range: "bytes=0-126" } } },
  // MTA (proxied once the transit module lands, #56)
  { id: "mta:subway-gtfs-rt", via: "proxy", url: "/api/transit/subway", optional: true },
  { id: "mta:bus-time", via: "proxy", url: "/api/transit/bus", optional: true },
  { id: "mta:alerts", via: "proxy", url: "/api/transit/alerts", optional: true },
  { id: "mta:elevators", via: "proxy", url: "/api/transit/elevators", optional: true },
  // Places (#55, #67)
  { id: "wikidata", via: "proxy", url: "/api/places/health", optional: true },
  // Called directly by the browser today
  { id: "geosearch", via: "direct", url: "https://geosearch.planninglabs.nyc/v2/autocomplete?text=broadway", expect: json },
  { id: "osrm:foot", via: "direct", url: "https://routing.openstreetmap.de/routed-foot/nearest/v1/foot/-73.9857,40.7484?number=1", expect: json },
  { id: "openfreemap:style", via: "direct", url: "https://tiles.openfreemap.org/styles/liberty", expect: json },
  { id: "socrata:311", via: "direct", url: "https://data.cityofnewyork.us/resource/erm2-nwe9.json?$limit=1", expect: json },
];
