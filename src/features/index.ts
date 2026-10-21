import type { FeatureModule } from "@/lib/features/types";
import agent from "./agent";
import daylight from "./daylight";
import restrooms from "./restrooms";
import transit from "./transit";
import weather from "./weather";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, agent, transit, daylight, weather];
