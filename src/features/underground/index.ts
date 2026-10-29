import type { FeatureModule } from "@/lib/features/types";

/**
 * Underground help (issue #373): a station's exits and the walk out, saved on
 * the phone for when there is no signal, plus an offline service worker for
 * the app shell and static transit files. Overlay only.
 */
const underground: FeatureModule = {
  id: "underground",
  overlay: { load: () => import("./Underground") },
  flags: ["underground", "transit"],
};

export default underground;
