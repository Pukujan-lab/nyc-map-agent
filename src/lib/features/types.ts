import type { ComponentType } from "react";
import type { FlagId } from "@/lib/flags";

/**
 * The shape every module in src/features/<name>/index.ts exports.
 * Features import only shared core (src/lib, src/components/ui), never each other.
 */
export interface FeatureModule {
  /** Stable id; also its feature-flag id. */
  id: FlagId;
  /**
   * Lazy-loaded MapLibre layer installer, its own JS chunk. If the module
   * exports `mount(map): () => void`, MapView mounts it while the flag is on
   * (and again after a style reload) and calls the cleanup when it goes off.
   */
  layers?: () => Promise<unknown>;
  /** React child rendered inside the map (react-map-gl Source/Layer); lazy so it is its own chunk. */
  MapLayer?: ComponentType;
  /** Items appended to the Layers dropdown (DropdownMenu* children). */
  LayersMenu?: ComponentType;
  /** Layer ids whose clicks the feature handles itself, so the area pick skips them. */
  clickLayers?: string[];
  /** A small line under the search bar (e.g. a hazard notice). No tooltips. */
  TopBar?: ComponentType;
  /**
   * An off-by-default chip in the chip row (state in the URL, `on=`). While
   * it is off the module's `layers` are not mounted.
   */
  chip?: { id: string; label: string };
  /** A section on the panel's home view (e.g. Nearby arrivals). */
  HomeSection?: ComponentType;
  /** A collapsed drawer in the place panel for the picked block / neighborhood. */
  PlaceSection?: { label: string; Component: ComponentType<{ lon: number; lat: number }> };
  /** Panel content ids this module pushes via usePanel().showPanel. */
  panel?: { idPrefix: string };
  /** Chip ids it registers with usePanelChip. */
  chips?: string[];
  /** Search provider ids it registers with usePanelSearch. */
  search?: string[];
  /** Flag ids that gate it (first is its own). */
  flags: FlagId[];
  /**
   * Lazy UI mounted once on the map page while the flag is on (own JS chunk).
   * `replacesChat` hands the rail's Ask button (MapState.chatOpen) to it.
   */
  overlay?: { load: () => Promise<{ default: ComponentType }>; replacesChat?: boolean };
  /** Hono route paths in server/features/<name>/. */
  routes?: string[];
}
