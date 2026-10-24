import type { FeatureModule } from "@/lib/features/types";

/**
 * Weather shown at street level: rain, snow or sleet drawn over street view
 * with how hard it falls, an overcast or fog tint, and a heads-up chip with
 * one plain recommendation for the hour (the planned trip's departure, else
 * now). The trip summary's heads-up line reads the same flag. Off by default
 * while in review.
 */
const streetWeather: FeatureModule = {
  id: "streetWeather",
  overlay: { load: () => import("./StreetWeather") },
  flags: ["streetWeather"],
  routes: ["/api/weather/hour"],
};

export default streetWeather;
