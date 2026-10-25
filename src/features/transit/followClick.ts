/** A map click versus Follow. Pure: no map object. */

export type FollowMapClick = { action: "start"; key: string } | { action: "clear" };

/** A train (vehicle dot or route bullet) or a bus badge. A station does not match. */
function startsFollow(layerId: string): boolean {
  return layerId.startsWith("transit-vehicle") || layerId === "transit-bullet" || layerId.startsWith("transit-bus-badge");
}

/**
 * The top transit feature under the click, or null when the click missed those layers.
 * A train or a bus starts Follow. Every other click drops it, including empty map.
 */
export function followActionForMapClick(hit: { layerId: string; key: unknown } | null): FollowMapClick {
  if (!hit || !startsFollow(hit.layerId)) return { action: "clear" };
  return { action: "start", key: String(hit.key) };
}
