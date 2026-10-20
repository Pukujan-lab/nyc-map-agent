import type { NtaBoundary } from "@/lib/api/nta";
import { pointInMultiPolygon } from "./pointInPolygon";

/** ~0.01 degrees, roughly 1.1 km at NYC's latitude. */
export const BUCKET_DEG = 0.01;

function bucketKey(bucketX: number, bucketY: number): string {
  return `${bucketX}:${bucketY}`;
}

/**
 * Coarse lat/lon bucket index over NTA bounding boxes. A point usually resolves
 * to 1–2 candidate neighborhoods, so the expensive ray-casting test runs a
 * handful of times per point instead of 262 times.
 */
export class NtaIndex {
  readonly boundaries: NtaBoundary[];
  private readonly buckets = new Map<string, number[]>();

  constructor(boundaries: NtaBoundary[]) {
    this.boundaries = boundaries;
    boundaries.forEach((boundary, index) => {
      const [minLon, minLat, maxLon, maxLat] = boundary.bbox;
      const startX = Math.floor(minLon / BUCKET_DEG);
      const endX = Math.floor(maxLon / BUCKET_DEG);
      const startY = Math.floor(minLat / BUCKET_DEG);
      const endY = Math.floor(maxLat / BUCKET_DEG);
      for (let x = startX; x <= endX; x += 1) {
        for (let y = startY; y <= endY; y += 1) {
          const key = bucketKey(x, y);
          const existing = this.buckets.get(key);
          if (existing) {
            if (!existing.includes(index)) existing.push(index);
          } else {
            this.buckets.set(key, [index]);
          }
        }
      }
    });
  }

  /** Returns the boundary index, or -1 when the point falls outside every NTA. */
  assignIndex(lat: number, lon: number): number {
    const key = bucketKey(
      Math.floor(lon / BUCKET_DEG),
      Math.floor(lat / BUCKET_DEG),
    );
    const candidates = this.buckets.get(key);
    if (!candidates) return -1;
    for (const index of candidates) {
      const boundary = this.boundaries[index];
      if (pointInMultiPolygon(lon, lat, boundary.polygons, boundary.bbox)) {
        return index;
      }
    }
    return -1;
  }

  assignCode(lat: number, lon: number): string | null {
    const index = this.assignIndex(lat, lon);
    return index === -1 ? null : this.boundaries[index].ntaCode;
  }
}
