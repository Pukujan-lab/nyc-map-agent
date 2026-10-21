import type { FeatureModule } from "@/lib/features/types";

/** Time-of-day lighting (suncalc, NYC), blended with the live weather look. */
const daylight: FeatureModule = {
  id: "daylight",
  layers: () => import("./layers"),
  flags: ["daylight"],
};

export default daylight;
