import type { FeatureModule } from "@/lib/features/types";

/**
 * Storefront signboards at eye level. Data: `storefronts` layer of the city
 * tiles (scripts/storefronts.ts: OSM via Geofabrik + osmium, DuckDB spatial
 * facade snapping). Rendering: the shared three.js layer in src/lib/map/threeLayer.ts.
 * A mall / many-shop main sign opens its shop directory in the panel.
 */
const storefronts: FeatureModule = {
  id: "storefronts",
  // No `layers`: the sign layer has no mount(); MapView adds it with the
  // textured city. A `layers` chunk here downloaded three.js on every first
  // load, Top view included (#364).
  panel: { idPrefix: "directory:" },
  flags: ["storefronts", "city3d"],
};

export default storefronts;
