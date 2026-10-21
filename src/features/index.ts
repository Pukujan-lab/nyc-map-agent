import type { FeatureModule } from "@/lib/features/types";
import agent from "./agent";
import daylight from "./daylight";
import hazards from "./hazards";
import parking from "./parking";
import restrooms from "./restrooms";
import traffic from "./traffic";
import transit from "./transit";
import weather from "./weather";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, agent, transit, daylight, weather, hazards, traffic, parking];
