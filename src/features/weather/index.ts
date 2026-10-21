import type { FeatureModule } from "@/lib/features/types";
import { WeatherBadge } from "./WeatherBadge";

/** Live weather for the map's area (Open-Meteo, NWS fallback) + rain/snow particles. */
const weather: FeatureModule = {
  id: "weather",
  layers: () => import("./weatherLayers"),
  TopBar: WeatherBadge,
  flags: ["weather"],
  routes: ["/api/weather"],
};

export default weather;
