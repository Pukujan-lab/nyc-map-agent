/**
 * A restroom trip walks street view only when the walking card's on-foot time
 * is under this many minutes. At the limit or longer, the walking route stays
 * on the map and the walk does not start.
 */
export const RESTROOM_WALK_LIMIT_MINUTES = 20;

/** Minutes the walking-directions card prints ("about N min"). */
export function onFootMinutes(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

/** True when that printed on-foot time is under {@link RESTROOM_WALK_LIMIT_MINUTES}. */
export function shouldWalkRestroomTrip(durationSeconds: number): boolean {
  return onFootMinutes(durationSeconds) < RESTROOM_WALK_LIMIT_MINUTES;
}
