import type { FeatureModule } from "@/lib/features/types";
import restrooms from "./restrooms";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms];
