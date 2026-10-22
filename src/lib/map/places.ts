import { useSyncExternalStore } from "react";
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";

/**
 * Places: basemap place icons are hidden until the person chooses categories
 * in the Layers & filters drawer (#171). Each choice maps to OpenMapTiles
 * `poi` classes and becomes one MapLibre filter on the basemap's own icon
 * layers. The selection is saved in localStorage.
 *
 * The open map data has no cuisine, price or opening-hours fields, so those
 * filters are not offered rather than faked.
 */
export interface PlaceSub { id: string; label: string; classes: string[] }
export interface PlaceCategory { id: string; label: string; subs: PlaceSub[] }

export const PLACE_CATEGORIES: PlaceCategory[] = [
  { id: "food", label: "Food", subs: [
    { id: "food.restaurant", label: "Restaurants", classes: ["restaurant"] },
    { id: "food.fast", label: "Fast food", classes: ["fast_food"] },
    { id: "food.bar", label: "Bars and pubs", classes: ["bar", "beer"] },
    { id: "food.bakery", label: "Bakeries", classes: ["bakery"] },
    { id: "food.icecream", label: "Ice cream", classes: ["ice_cream"] },
  ] },
  { id: "coffee", label: "Coffee", subs: [{ id: "coffee.cafe", label: "Cafés", classes: ["cafe"] }] },
  { id: "todo", label: "Things to do", subs: [
    { id: "todo.museum", label: "Museums and galleries", classes: ["museum", "art_gallery"] },
    { id: "todo.shows", label: "Theatres and cinemas", classes: ["theatre", "cinema"] },
    { id: "todo.sights", label: "Sights", classes: ["attraction", "monument", "castle", "zoo", "aquarium"] },
    { id: "todo.library", label: "Libraries", classes: ["library"] },
    { id: "todo.sport", label: "Sports", classes: ["stadium", "swimming", "pitch", "sports"] },
  ] },
  { id: "shopping", label: "Shopping", subs: [
    { id: "shop.grocery", label: "Groceries", classes: ["grocery"] },
    { id: "shop.clothes", label: "Clothing", classes: ["clothing_store"] },
    { id: "shop.books", label: "Books", classes: ["books"] },
    { id: "shop.other", label: "Other shops", classes: ["shop", "gift", "jewelry", "alcohol_shop", "music", "furniture", "florist", "hardware", "mobile_phone"] },
  ] },
  { id: "parks", label: "Parks", subs: [
    { id: "parks.park", label: "Parks", classes: ["park"] },
    { id: "parks.play", label: "Playgrounds", classes: ["playground"] },
    { id: "parks.dog", label: "Dog parks", classes: ["dog_park"] },
  ] },
  { id: "restrooms", label: "Restrooms", subs: [{ id: "rest.toilets", label: "Public toilets", classes: ["toilets"] }] },
];

export const PLACES_KEY = "nma.places.v2";
export const POI_LAYERS = /^poi_r\d+$/;
const ALL_SUBS = new Map(PLACE_CATEGORIES.flatMap((c) => c.subs.map((s) => [s.id, s] as const)));

export function readPlaces(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Set<string> {
  try {
    const raw = JSON.parse(storage?.getItem(PLACES_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && ALL_SUBS.has(x)) : []);
  } catch {
    return new Set();
  }
}

/** The OpenMapTiles classes the chosen subcategories cover, sorted. Pure, for tests. */
export function classesFor(selected: ReadonlySet<string>): string[] {
  return [...new Set([...selected].flatMap((id) => ALL_SUBS.get(id)?.classes ?? []))].sort();
}

let selected = readPlaces();
const listeners = new Set<() => void>();
export function setPlaces(next: Set<string>): void {
  selected = new Set(next);
  try {
    if (selected.size) localStorage.setItem(PLACES_KEY, JSON.stringify([...selected]));
    else localStorage.removeItem(PLACES_KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}
export function usePlaces(): Set<string> {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => selected, () => selected);
}

const original = new WeakMap<MapLibreMap, Map<string, FilterSpecification | undefined>>();

/** Businesses switch: on with nothing chosen shows food, coffee and shops;
 * off strips those categories from any saved choice. */
const BIZ = new Set(["food", "coffee", "shopping"]);
export function withBusinesses(chosen: ReadonlySet<string>, on: boolean): Set<string> {
  const biz = (id: string) => BIZ.has(id.split(".")[0] === "shop" ? "shopping" : id.split(".")[0]);
  if (!on) return new Set([...chosen].filter((id) => !biz(id)));
  if ([...chosen].some(biz)) return new Set(chosen);
  return new Set([...chosen, ...PLACE_CATEGORIES.filter((c) => BIZ.has(c.id)).flatMap((c) => c.subs.map((s) => s.id))]);
}
export function applyPlaces(map: MapLibreMap, chosen: ReadonlySet<string>): void {
  const classes = classesFor(chosen);
  let store = original.get(map);
  if (!store) { store = new Map<string, FilterSpecification | undefined>(); original.set(map, store); }
  for (const l of map.getStyle()?.layers ?? []) {
    if (!POI_LAYERS.test(l.id)) continue;
    if (!store.has(l.id)) store.set(l.id, map.getFilter(l.id) ?? undefined);
    if (!classes.length) {
      map.setLayoutProperty(l.id, "visibility", "none");
      continue;
    }
    const base = store.get(l.id);
    const match: FilterSpecification = ["match", ["get", "class"], classes, true, false];
    map.setFilter(l.id, (base ? ["all", base, match] : match) as FilterSpecification);
    map.setLayoutProperty(l.id, "visibility", "visible");
  }
}
