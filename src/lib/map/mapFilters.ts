import type { FilterPatch } from "./filterPatch";
import { SUBWAY_ROUTES, setOptions, type MapOptions } from "./mapOptions";
import { PLACE_CATEGORIES, setPlaces } from "./places";
import { setQuickLayer, type QuickId } from "../quickLayers";
import { setTransitFocus } from "./transitFocus";
import { setTheme } from "../theme";

const QUICK: QuickId[] = ["businesses", "streetArt", "xray", "health", "parksPlaces", "citibike"];
const CHIPS = ["events", "parking", "traffic", "weather", "ferry"] as const;
const KNOWN_PLACES = new Set(PLACE_CATEGORIES.flatMap((c) => c.subs.map((s) => s.id)));
const PLACE_GROUP: Record<string, QuickId> = {};
for (const cat of PLACE_CATEGORIES) {
  const group: QuickId | undefined =
    cat.id === "health" ? "health"
    : cat.id === "parks" || cat.id === "todo" ? "parksPlaces"
    : cat.id === "citibike" ? "citibike"
    : cat.id === "food" || cat.id === "coffee" || cat.id === "shopping" ? "businesses"
    : undefined;
  if (group) for (const sub of cat.subs) PLACE_GROUP[sub.id] = group;
}

function transitIds(params: URLSearchParams): Set<string> {
  return new Set((params.get("transit") ?? "subway").split(",").filter((id) => id && id !== "none"));
}

function writeTransit(params: URLSearchParams, ids: Set<string>): void {
  const joined = ids.size ? [...ids].join(",") : "none";
  if (joined === "subway") params.delete("transit");
  else params.set("transit", joined);
}

function writeChip(params: URLSearchParams, id: string, on: boolean): void {
  const set = new Set((params.get("on") ?? "").split(",").filter(Boolean));
  if (on) set.add(id);
  else set.delete(id);
  if (set.size) params.set("on", [...set].join(","));
  else params.delete("on");
}

/** Layers that live in localStorage: roads, places, theme, x-ray, and the rest of the quick list. */
export function applyStoredFilters(patch: FilterPatch): void {
  const options: Partial<MapOptions> = {};
  if (patch.roads !== undefined) options.roads = patch.roads;
  if (patch.busStops !== undefined) options.busStops = patch.busStops;
  if (patch.streetNames !== undefined) options.streetNames = patch.streetNames;
  if (patch.buildings) options.buildings = patch.buildings;
  if (patch.streets) options.streets = patch.streets;
  if (patch.stationsOnly !== undefined) options.stationsOnly = patch.stationsOnly;
  if (patch.routes) options.routes = patch.routes.filter((r) => (SUBWAY_ROUTES as readonly string[]).includes(r));
  if (Object.keys(options).length) setOptions(options);
  if (patch.places) {
    const ids = patch.places.filter((id) => KNOWN_PLACES.has(id));
    setPlaces(new Set(ids));
    for (const id of ids) {
      const group = PLACE_GROUP[id];
      if (group) setQuickLayer(group, true);
    }
  }
  for (const id of QUICK) if (patch[id] !== undefined) setQuickLayer(id, patch[id]);
  if (patch.transitFocus !== undefined) setTransitFocus(patch.transitFocus);
  if (patch.theme) setTheme(patch.theme);
}

/**
 * Layers that live in the URL. Returns the same object when nothing in the
 * patch touches the URL, so the router does not replace the address.
 */
export function searchForFilters(prev: URLSearchParams, patch: FilterPatch): URLSearchParams {
  const next = new URLSearchParams(prev);
  let touched = false;
  const mark = () => { touched = true; };
  if (patch.restrooms !== undefined) {
    mark();
    next.set("restrooms", patch.restrooms ? "1" : "0");
  }
  if (patch.eco !== undefined) {
    mark();
    next.set("eco", patch.eco ? "1" : "0");
  }
  if (patch.texturedCity !== undefined) {
    mark();
    next.set("city3d", patch.texturedCity ? "1" : "0");
  }
  if (patch.liveTrains !== undefined || patch.liveBuses === false) {
    mark();
    const ids = transitIds(next);
    if (patch.liveTrains !== undefined) {
      if (patch.liveTrains) ids.add("subway");
      else ids.delete("subway");
    }
    if (patch.liveBuses === false) {
      ids.delete("bus");
      next.delete("busPage");
    }
    writeTransit(next, ids);
  }
  for (const id of CHIPS) {
    if (patch[id] !== undefined) {
      mark();
      writeChip(next, id, patch[id]);
    }
  }
  return touched ? next : prev;
}
