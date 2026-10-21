import type { FeatureModule } from "@/lib/features/types";

/** Smart mode: voice + text trip agent on the rail's Ask button. */
const agent: FeatureModule = {
  id: "agent",
  overlay: { load: () => import("./AgentOverlay"), replacesChat: true },
  flags: ["agent"],
  routes: ["/api/agent"],
};

export default agent;
