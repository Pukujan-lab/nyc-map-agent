import type { MapContext } from "./context";

/**
 * The rule table: for each context, what happens to each group of map layers.
 *   keep  — the user's own toggles decide (nothing is overridden)
 *   hide  — visibility "none" while the context lasts
 *   dim   — opacity scaled down
 *   focus — only features on the context's route stay; the rest go transparent
 * Layers whose id starts with `landmark-` are always kept. Pure.
 */
export type Treatment = "keep" | "hide" | "dim" | "focus";

export const GROUPS = [
  "landmarks", "subwayLines", "stations", "trains", "buses", "busRoute", "serviceChanges",
  "trip", "walkRoute", "ferry", "restrooms", "businesses", "events", "parking", "hazards",
  "data", "roads", "basemap",
] as const;
export type LayerGroup = (typeof GROUPS)[number];

/** First match wins. Anything unmatched is basemap and is never touched. */
const CLASSIFY: [RegExp, LayerGroup][] = [
  [/^landmark-/, "landmarks"],
  [/-veil$/, "basemap"], // Transit Focus / X-ray / alert veils belong to their own switches
  [/^agent-/, "trip"],
  [/^walk-route-/, "walkRoute"],
  [/^transit-(line|line-under|viaduct|pier)$/, "subwayLines"],
  [/^transit-(station|station-raised|station-label|access|entrance)$/, "stations"],
  [/^poi_transit$/, "stations"],
  [/^transit-(bullet|bullet-notch|train-dot|vehicle-2d|vehicle-hit)$/, "trains"],
  [/^transit-bus-route-/, "busRoute"],
  [/^transit-bus-/, "buses"],
  [/^transit-(work|work-line|skip|alert-affected|alert-reroute|alert-skipped)$/, "serviceChanges"],
  [/^ferry-/, "ferry"],
  [/^(restrooms|place-toilets)/, "restrooms"],
  [/^(poi_|storefront|city3d-storefront|city3d-schools|school|places?-)/, "businesses"],
  [/^events-/, "events"],
  [/^parking-/, "parking"],
  [/^hazards-/, "hazards"],
  [/^(area-|block-|neighborhood-|borough-outline|emphasis-outline|noise|crash|traffic-|data-|source-)/, "data"],
  [/^(road_|tunnel_|bridge_)(?!.*(name|shield|label|one_way))/, "roads"],
];

export function classifyLayer(id: string): LayerGroup {
  for (const [re, g] of CLASSIFY) if (re.test(id)) return g;
  return "basemap";
}

type Table = Partial<Record<LayerGroup, Treatment>>;

/** Riding along with one vehicle: its line, its stops, it, and landmarks. */
const QUIET: Table = { ferry: "hide", businesses: "hide", events: "hide", parking: "hide", hazards: "hide", data: "hide", roads: "dim" };

const FOLLOW_SUBWAY: Table = { ...QUIET, subwayLines: "focus", stations: "focus", trains: "focus", serviceChanges: "focus", buses: "hide", busRoute: "hide", restrooms: "hide", walkRoute: "hide" };
const FOLLOW_BUS: Table = { ...QUIET, buses: "focus", busRoute: "keep", subwayLines: "hide", stations: "hide", trains: "hide", serviceChanges: "hide", restrooms: "hide", walkRoute: "hide" };
/** Without a known route the line cannot be singled out, so other modes go and lines dim. */
const FOLLOW_UNKNOWN: Table = { ...QUIET, subwayLines: "dim", trains: "dim", buses: "hide", busRoute: "hide", restrooms: "hide" };
const TRIP: Table = { ...QUIET, trip: "keep", subwayLines: "dim", stations: "keep", trains: "dim", buses: "hide", busRoute: "hide", serviceChanges: "keep" };
/** On foot: streets, nearby restrooms (if on), stations nearby, landmarks. No moving transit. */
const WALKING: Table = { subwayLines: "hide", trains: "hide", buses: "hide", busRoute: "hide", serviceChanges: "hide", ferry: "hide", parking: "hide", data: "hide", stations: "keep", restrooms: "keep", roads: "keep" };
const PLACE: Table = { subwayLines: "dim", trains: "dim", buses: "hide", busRoute: "hide", serviceChanges: "hide", ferry: "hide", events: "hide", parking: "hide", data: "hide" };
const AGENT: Table = { buses: "dim", trains: "dim", ferry: "hide", events: "hide", parking: "hide", data: "hide" };

export function rulesFor(c: MapContext): Table {
  switch (c.kind) {
    case "following":
      if (!c.route) return FOLLOW_UNKNOWN;
      return c.system === "bus" ? FOLLOW_BUS : FOLLOW_SUBWAY;
    case "trip": return TRIP;
    case "walking": return WALKING;
    case "place": return PLACE;
    case "agent": return AGENT;
    default: return {};
  }
}

/** The treatment for one layer in a context. Landmarks and basemap are always kept. */
export function treatmentFor(layerId: string, c: MapContext): Treatment {
  const g = classifyLayer(layerId);
  if (g === "landmarks" || g === "basemap") return "keep";
  return rulesFor(c)[g] ?? "keep";
}

/** Routes that count as "the line": an express (6X, FX) is drawn on its local's track. */
export function focusRoutes(route: string): string[] {
  const base = route.replace(/X$/, "");
  return base && base !== route ? [route, base] : [route];
}

/**
 * The MapLibre filter for "this feature is on the focused line", or null when
 * the layer carries no route (focus then hides it). Stations list their
 * routes space-separated ("E F M R").
 */
export function focusMatch(layerId: string, routes: string[]): unknown[] | null {
  const g = classifyLayer(layerId);
  if (layerId === "transit-entrance" || layerId === "transit-vehicle-hit" || layerId === "poi_transit") return null;
  if (g === "stations") {
    const padded = ["concat", " ", ["to-string", ["coalesce", ["get", "routes"], ""]], " "];
    return ["any", ...routes.map((r) => ["in", ` ${r} `, padded])];
  }
  return ["in", ["to-string", ["coalesce", ["get", "route"], ""]], ["literal", routes]];
}
