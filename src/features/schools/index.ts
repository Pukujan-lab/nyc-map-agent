import type { FeatureModule } from "@/lib/features/types";

/**
 * School buildings in the textured 3D city: the "school" facade is baked into
 * the city tiles (scripts/build-city-tiles.ts, DOE points joined with DuckDB
 * spatial); the optional icons and the click card live in src/lib/map/city3d.ts
 * next to the city3d source they read.
 */
const schools: FeatureModule = {
  id: "schools",
  panel: { idPrefix: "school:" },
  chips: ["schools"],
  flags: ["schools", "city3d"],
};

export default schools;
