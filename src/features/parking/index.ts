import type { FeatureModule } from "@/lib/features/types";
import { StreetRules } from "./StreetRules";

/** Garages / lots (DCWP + OSM) and street parking rules (DOT signs + meters). Chip, off by default. */
const parking: FeatureModule = {
  id: "parking",
  layers: () => import("./layers"),
  chip: { id: "parking", label: "Parking" },
  PlaceSection: { label: "Street parking rules", Component: StreetRules },
  panel: { idPrefix: "parking:" },
  flags: ["parking"],
  routes: ["/api/parking", "/api/parking/near", "/api/parking/rules"],
};

export default parking;
