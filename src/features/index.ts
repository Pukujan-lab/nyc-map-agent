import type { FeatureModule } from "@/lib/features/types";
import restrooms from "./restrooms";
import schools from "./schools";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, schools];
