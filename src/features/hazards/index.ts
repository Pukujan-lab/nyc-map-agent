import type { FeatureModule } from "@/lib/features/types";
import { HazardLine } from "./HazardLine";

/** NWS alerts for NYC + FloodNet street flood sensors (safety info: basic tier). */
const hazards: FeatureModule = {
  id: "hazards",
  layers: () => import("./hazardsLayers"),
  TopBar: HazardLine,
  panel: { idPrefix: "hazard:" },
  flags: ["hazards"],
  routes: ["/api/hazards"],
};

export default hazards;
