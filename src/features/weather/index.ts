import type { FeatureModule } from "@/lib/features/types";
import { WeatherBadge } from "./WeatherBadge";

/** Live weather for the map's area (Open-Meteo, NWS fallback) + rain/snow particles. */
const weather: FeatureModule = {
  id: "weather",
  layers: () => import("./weatherLayers"),
  TopBar: WeatherBadge,
  /** Rain / snow particles on the map; the badge above shows either way. */
  chip: { id: "weather", label: "Weather" },
  flags: ["weather"],
  routes: ["/api/weather"],
};

export default weather;
