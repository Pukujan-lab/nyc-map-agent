import type { FlagId } from "@/lib/flags";

/**
 * The shape every module in src/features/<name>/index.ts exports.
 * Features import only shared core (src/lib, src/components/ui), never each other.
 */
export interface FeatureModule {
  /** Stable id; also its feature-flag id. */
  id: FlagId;
  /** Lazy-loaded MapLibre layer installer, its own JS chunk. */
  layers?: () => Promise<unknown>;
  /** Panel content ids this module pushes via usePanel().showPanel. */
  panel?: { idPrefix: string };
  /** Chip ids it registers with usePanelChip. */
  chips?: string[];
  /** Search provider ids it registers with usePanelSearch. */
  search?: string[];
  /** Flag ids that gate it (first is its own). */
  flags: FlagId[];
  /** Hono route paths in server/features/<name>/. */
  routes?: string[];
}
