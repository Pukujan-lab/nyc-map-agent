import type { FeatureModule } from "@/lib/features/types";

/**
 * Navigation guidance on the walking route (phase 1 of Live View): glowing
 * route, chevrons, turn arrow, next-turn card and street pill in street view
 * and in a heading-up 2D "Navigate" mode. Steps come from the same OSRM foot
 * router as the Directions card. Overlay only: it adds its own MapLibre
 * layers through the shared map instance.
 */
const liveview: FeatureModule = {
  id: "liveview",
  overlay: { load: () => import("./RouteGuide") },
  flags: ["liveview", "directions"],
};

export default liveview;
