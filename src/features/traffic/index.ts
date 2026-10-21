import type { FeatureModule } from "@/lib/features/types";

/** Live traffic speeds on DOT sensor corridors + street closures. Chip, off by default. */
const traffic: FeatureModule = {
  id: "traffic",
  layers: () => import("./layers"),
  chip: { id: "traffic", label: "Traffic" },
  flags: ["traffic"],
  routes: ["/api/traffic", "/api/traffic/along"],
};

export default traffic;
