/** Stop dots for a selected bus route. Bus vehicles are other layers and stay put. */
export const BUS_STOP_DOT_LAYERS = ["transit-bus-route-stop", "transit-bus-route-stop-name"] as const;

/**
 * Layout visibility to apply, or null when the layer is already right.
 * An unset visibility is visible, so hiding is the only write while dots are on.
 */
export function visibilityPatch(current: unknown, show: boolean): "visible" | "none" | null {
  const want = show ? "visible" : "none";
  const now = current === "none" ? "none" : "visible";
  return now === want ? null : want;
}
