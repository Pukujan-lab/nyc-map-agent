import type { FeatureModule } from "@/lib/features/types";

const restrooms: FeatureModule = {
  id: "restrooms",
  layers: () => import("./layers"),
  panel: { idPrefix: "restroom:" },
  chips: ["restrooms"],
  flags: ["restrooms"],
  routes: ["/api/restrooms"],
};

export default restrooms;
