import type { Bbox } from "@/lib/api/nta";

/** Zoom that frames a whole neighborhood. */
const NEIGHBORHOOD_ZOOM = 13.5;

/** Where the camera goes when someone picks a neighborhood from a list. */
export function neighborhoodCameraTarget(bbox: Bbox): { lon: number; lat: number; zoom: number } {
  return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2, zoom: NEIGHBORHOOD_ZOOM };
}

/**
 * "Jump to a neighborhood": select it, open its full sheet, and move the map
 * there. Selecting alone leaves the camera where it was, which reads as broken.
 */
export function jumpToNeighborhood(
  code: string,
  options: ReadonlyArray<{ code: string; bbox: Bbox }>,
  actions: {
    selectNta: (code: string) => void;
    setDetailsExpanded: (expanded: boolean) => void;
    flyTo: (target: { lon: number; lat: number; zoom: number }) => void;
  },
): void {
  actions.selectNta(code);
  // Chosen from a list, not tapped on the map — the numbers are what was
  // asked for, so open the full sheet straight away.
  actions.setDetailsExpanded(true);
  const option = options.find((n) => n.code === code);
  if (option) actions.flyTo(neighborhoodCameraTarget(option.bbox));
}
