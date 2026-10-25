/** A map click versus Follow. Pure: no map object. */

export type FollowMapClick = { action: "start"; key: string } | { action: "release" } | { action: "clear" };

/** A train (vehicle dot or route bullet) or a bus badge. A station does not match. */
function startsFollow(layerId: string): boolean {
  return layerId.startsWith("transit-vehicle") || layerId === "transit-bullet" || layerId.startsWith("transit-bus-badge");
}

/**
 * The top transit feature under the click, or null when the click missed those layers.
 * A train or a bus starts Follow; the one you already follow lets go (#297), easing the
 * camera back like Stop following. With several things on the spot, TapCycle hands the
 * next one here instead, so repeat taps still step to the station. Every other click drops it.
 */
export function followActionForMapClick(hit: { layerId: string; key: unknown } | null, followedKey?: string | null): FollowMapClick {
  if (!hit || !startsFollow(hit.layerId)) return { action: "clear" };
  const key = String(hit.key);
  return followedKey && key === followedKey ? { action: "release" } : { action: "start", key };
}
