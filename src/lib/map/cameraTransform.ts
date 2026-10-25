import type { Map as MapLibreMap } from "maplibre-gl";

/** The camera reads MapLibre keeps off its public types. */
export interface CameraTransform {
  getCameraAltitude(): number;
  getCameraLngLat(): { lng: number; lat: number };
}

/**
 * The map's live camera transform. MapLibre 6 moved it from `map.transform`
 * to `map._camera.transform`; both are tried so a version change degrades to
 * undefined instead of throwing.
 */
export function cameraTransform(map: MapLibreMap): CameraTransform | undefined {
  const m = map as unknown as { _camera?: { transform?: CameraTransform }; transform?: CameraTransform };
  return m._camera?.transform ?? m.transform;
}
