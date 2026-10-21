import type { FeatureModule } from "@/lib/features/types";

/**
 * Storefront signboards at eye level. Data: `storefronts` layer of the city
 * tiles (scripts/storefronts.ts: OSM via Geofabrik + osmium, DuckDB spatial
 * facade snapping). Rendering: the shared three.js layer in src/lib/map/threeLayer.ts.
 * A mall / many-shop main sign opens its shop directory in the panel.
 */
const storefronts: FeatureModule = {
  id: "storefronts",
  layers: () => import("@/lib/map/threeLayer"),
  panel: { idPrefix: "directory:" },
  flags: ["storefronts", "city3d"],
};

export default storefronts;
