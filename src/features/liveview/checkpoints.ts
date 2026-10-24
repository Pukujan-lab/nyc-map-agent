import { pickGuideLandmarks, type GuideLandmark, type GuidePick } from "@/lib/guide/landmarkGuide";

/** A visible landmark with a reference photo; never repeat one the walker confirmed. */
export function nextCheckpoint(at: { lon: number; lat: number }, heading: number, list: readonly GuideLandmark[], confirmed: readonly string[]): GuidePick | null {
  return pickGuideLandmarks(at, heading, {
    max: list.length, maxDistanceM: 1500,
    list: list.filter((l) => l.picture && !confirmed.includes(l.id)),
  }).find((p) => p.turn !== null && Math.abs(p.turn) <= 90) ?? null;
}
