import type { Map as MaplibreMap } from "maplibre-gl";

/** In 3D, labels and bullets on raised track lift by about a viaduct's height on screen. */
export const RAISED_LIFT_PX = 26;
/** In 3D a dwelling train lifts this far so the station stays readable; flat, it stays on the track (owner report, 2026-10-25). */
export const STOP_LIFT_PX = 52;

/**
 * These stay above the 3D vehicle layer: the station, its train bullet, skip marks, the followed bus badge, and at
 * street level the name over each stair (the kit's sign and globe lamps hid it; owner, 2026-10-27).
 */
export const ABOVE_VEHICLE_LAYERS = ["transit-bullet-notch", "transit-bullet", "transit-held", "transit-station", "transit-station-raised", "transit-station-label", "transit-skip", "transit-alert-skipped", "transit-bus-badge-follow", "transit-entrance-label"];

type LayerOrderMap = Pick<MaplibreMap, "getLayer" | "getLayersOrder" | "moveLayer">;

/** Keep station names and the followed bus badge painted after the 3D vehicles. */
export function paintAboveVehicles(map: LayerOrderMap, vehicleLayerId?: string) {
  const overlay = ABOVE_VEHICLE_LAYERS.filter((id) => map.getLayer(id));
  const vid = vehicleLayerId && map.getLayer(vehicleLayerId) ? vehicleLayerId : undefined;
  const tail = vid ? [vid, ...overlay] : overlay;
  if (!tail.length) return;
  const ids = map.getLayersOrder();
  const got = ids.slice(-tail.length);
  if (tail.every((id, i) => got[i] === id)) return;
  if (vid) map.moveLayer(vid);
  for (const id of overlay) map.moveLayer(id);
}

/** Screen offset for a train bullet or its heading notch. Dwelling trains clear the station. */
export function trainIconOffset(three: boolean, notch: number) {
  const y = (lift: number) => ["literal", [0, -(lift + notch)]] as unknown as [number, number];
  // Flat, a train sits on its track even at a station: lifted 52 px it read as off the line.
  if (!three) return y(0);
  return ["case",
    ["all", ["==", ["get", "grade"], "elevated"], ["==", ["get", "atStop"], 1]], y(RAISED_LIFT_PX + STOP_LIFT_PX),
    ["==", ["get", "atStop"], 1], y(STOP_LIFT_PX),
    ["==", ["get", "grade"], "elevated"], y(RAISED_LIFT_PX),
    y(0),
  ] as unknown as [number, number];
}

/**
 * What the camera does when the alert focus changes. While Follow is on the chase
 * camera owns the view, so an alert only highlights its geometry: no fitBounds, and
 * no ease back to a stale pre-alert view (that would fight the per-update jumpTo).
 */
export function alertCameraAction(o: { hasBounds: boolean; hasFocus: boolean; hasSaved: boolean; following: boolean }): "fit" | "restore" | "drop" | "none" {
  if (o.following) return o.hasSaved ? "drop" : "none";
  if (o.hasBounds) return "fit";
  if (!o.hasFocus && o.hasSaved) return "restore";
  return "none";
}
