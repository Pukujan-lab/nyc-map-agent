import type { FeatureModule } from "@/lib/features/types";

/** NYC Ferry + Staten Island Ferry: routes, piers and vessels (live GTFS-rt, else schedule estimates). */
const ferry: FeatureModule = {
  id: "ferry",
  layers: () => import("./ferryLayers"),
  chip: { id: "ferry", label: "Ferries" },
  clickLayers: ["ferry-vessels", "ferry-terminals"],
  flags: ["ferry"],
  routes: ["/api/ferry"],
};

export default ferry;
