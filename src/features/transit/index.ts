import { lazy } from "react";
import type { FeatureModule } from "@/lib/features/types";
import TransitMenu from "./TransitMenu";

/** Live MTA transit: subway, LIRR, Metro-North (GTFS-rt, no key) and Bus Time buses (MTA_BUSTIME_KEY). */
const transit: FeatureModule = {
  id: "transit",
  layers: () => import("./layers"),
  MapLayer: lazy(() => import("./layers")),
  LayersMenu: TransitMenu,
  HomeSection: lazy(() => import("./Nearby")),
  clickLayers: ["transit-vehicle-2d", "transit-vehicle-hit", "transit-access", "transit-entrance", "transit-station"],
  panel: { idPrefix: "transit:" },
  chips: ["transit"],
  search: ["transit-stations"],
  flags: ["transit"],
  routes: ["/api/transit", "/api/transit/:system"],
};

export default transit;
