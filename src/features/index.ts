import type { FeatureModule } from "@/lib/features/types";
import daylight from "./daylight";
import hazards from "./hazards";
import restrooms from "./restrooms";
import parking from "./parking";
import traffic from "./traffic";
import weather from "./weather";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, daylight, weather, hazards, traffic, parking];
