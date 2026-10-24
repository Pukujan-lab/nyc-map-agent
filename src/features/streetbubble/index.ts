import type { FeatureModule } from "@/lib/features/types";

/**
 * Noise and crash levels for the street underfoot while walking. Overlay only:
 * it reads the walking state and the street label from shared core.
 */
const streetbubble: FeatureModule = {
  id: "streetBubble",
  overlay: { load: () => import("./StreetBubbleOverlay") },
  flags: ["streetBubble"],
};

export default streetbubble;
