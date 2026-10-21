import type { FeatureModule } from "@/lib/features/types";
import agent from "./agent";
import daylight from "./daylight";
import restrooms from "./restrooms";
import transit from "./transit";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, agent, transit, daylight];
