import type { EventWindow } from "./window";
import { windowRange } from "./window";

/** One event as /api/events serves it (see server/features/events/schema.ts). */
export interface EventProps {
  id: string;
  title: string;
  kind: "fair" | "market" | "popup" | "show" | "parks" | "closure" | "other";
  start: string;
  end: string;
  address: string | null;
  source: "nyc-permitted-events" | "nyc-parks-events";
  url: string | null;
}
export type EventFeature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString, EventProps>;

export const KIND_LABEL: Record<EventProps["kind"], string> = {
  fair: "Street fair",
  market: "Market",
  popup: "Pop-up",
  show: "Outdoor show",
  parks: "Parks event",
  closure: "Street closure",
  other: "Street event",
};

export const SOURCE_LABEL: Record<EventProps["source"], string> = {
  "nyc-permitted-events": "NYC permitted events (NYC Open Data)",
  "nyc-parks-events": "NYC Parks",
};

export async function fetchEvents(w: EventWindow, now = new Date()): Promise<EventFeature[]> {
  const { from, to } = windowRange(w, now);
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const res = await fetch(`/api/v1/events?${q}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: EventFeature[] };
  return body.features ?? [];
}

/** Where a pin goes: the point, or the middle of a closed block. */
export function pinAt(f: EventFeature): [number, number] {
  const g = f.geometry;
  if (g.type === "Point") return g.coordinates as [number, number];
  const [a, b] = [g.coordinates[0], g.coordinates[g.coordinates.length - 1]];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
