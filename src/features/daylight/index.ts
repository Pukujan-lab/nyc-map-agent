import type { FeatureModule } from "@/lib/features/types";

/** Time-of-day lighting (suncalc, NYC), blended with the live weather look. */
const daylight: FeatureModule = {
  id: "daylight",
  layers: () => import("./daylightLayers"),
  flags: ["daylight"],
};

export default daylight;
