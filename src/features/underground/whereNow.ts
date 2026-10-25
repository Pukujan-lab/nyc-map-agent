/**
 * Where the person is in the underground helper right now, for the agent:
 * riding toward a station, or at a station looking for an exit. Kept in
 * memory only, read when a question is sent, never stored.
 */
export type UndergroundNow = { stage: "riding" | "at-station"; station: string; exit: string | null };

let now: UndergroundNow | null = null;

export function setUndergroundNow(next: UndergroundNow | null): void {
  now = next;
}

export function getUndergroundNow(): UndergroundNow | null {
  return now;
}
