import type { FeatureModule } from "@/lib/features/types";

/**
 * Restaurants, cafés, bars and shops with a toilet (OpenStreetMap, refreshed
 * nightly into core.place_toilets). An extension of Restrooms: while Restrooms
 * is on, an "Include shops & cafés" chip (off by default) shows them from
 * zoom 15, each labelled "Anyone" or "Customers only".
 */
const placeToilets: FeatureModule = {
  id: "placeToilets",
  layers: () => import("./layers"),
  overlay: { load: () => import("./ShopsToggle") },
  clickLayers: ["place-toilets"],
  panel: { idPrefix: "place-toilet:" },
  chips: ["restroomShops"],
  flags: ["placeToilets", "restrooms"],
  routes: ["/api/place-toilets"],
};

export default placeToilets;
