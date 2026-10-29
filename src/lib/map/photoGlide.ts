import type { CameraTarget } from "@/lib/store/MapStateContext";

/** Street-level camera while stepping through photos (#10): low and tilted, like walking the block. */
export const PHOTO_ZOOM = 18.4;
export const PHOTO_PITCH = 72;

/** Where the map should glide for a photo taken at `at`, facing `bearing` degrees. */
export function photoCamera(at: { lng: number; lat: number }, bearing: number): Omit<CameraTarget, "nonce"> {
  return { lon: at.lng, lat: at.lat, zoom: PHOTO_ZOOM, pitch: PHOTO_PITCH, bearing: ((bearing % 360) + 360) % 360, glide: true };
}
