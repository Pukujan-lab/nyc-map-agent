import type { ExitPlace, Pt } from "@/lib/map/mapRead";
import type { StaticSystem } from "./model";

/**
 * Street level: a label over each nearby subway entrance, corner first
 * ("6 Av & W 47 St · SE corner"), then what it is ("Stairs", "Elevator · out
 * of service"). The station's name and line bullets already stand once over
 * the station, so they are not repeated per entrance. Only the nearest few get
 * one; on a phone, one line until you are close.
 */
export interface EntranceLabelOpts {
  /** How many of the nearest entrances get a label. */
  max: number;
  /** Phones: the second line only within `closeM`. */
  phone: boolean;
  closeM?: number;
  radiusM?: number;
}

const WORDS: Record<string, string> = { Avenue: "Av", Street: "St", Place: "Pl", Road: "Rd", Boulevard: "Blvd", Parkway: "Pkwy", Square: "Sq", Drive: "Dr", Lane: "Ln", Plaza: "Plz", Terrace: "Ter", West: "W", East: "E", North: "N", South: "S" };

/** "West 47th Street" → "W 47 St", as NYC street signs read; a label over a stair has room for a few words only. */
export function shortStreet(name: string): string {
  return name.split(" ").map((w) => WORDS[w] ?? w.replace(/^(\d+)(st|nd|rd|th)$/i, "$1")).join(" ");
}

/** What the entrance is, in words; null for passages and station houses (no kit, no label). */
export function entranceKind(kind: string, out: boolean): string | null {
  if (/elevator/i.test(kind)) return out ? "Elevator · out of service" : "Elevator";
  if (/escalator/i.test(kind)) return "Escalator";
  if (/stair/i.test(kind)) return "Stairs";
  return null;
}

/** The corner line, or null when the tiles have no street names here yet. */
export function cornerLine(place: ExitPlace): string | null {
  if (!place.streets) return null;
  // Avenue first, as people say it ("6 Av & W 47 St"), so two stairs on one corner read the same.
  const streets = place.streets.map(shortStreet).sort((a, b) => Number(/\bAv\b/.test(b)) - Number(/\bAv\b/.test(a)) || a.localeCompare(b)).join(" & ");
  return place.corner ? `${streets} · ${place.corner} corner` : streets;
}

function metresBetween(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

export function entranceLabels(
  sys: StaticSystem,
  outStations: Set<string>,
  eye: Pt,
  placeAt: (at: Pt) => ExitPlace,
  { max, phone, closeM = 60, radiusM = 300 }: EntranceLabelOpts,
): GeoJSON.FeatureCollection<GeoJSON.Point, { label: string; d: number }> {
  const near: Array<{ at: Pt; kind: string; d: number }> = [];
  for (const f of sys.entrances?.features ?? []) {
    const at = f.geometry.coordinates as Pt;
    const d = metresBetween(at, eye);
    if (d > radiusM) continue;
    const kind = entranceKind(f.properties.kind, outStations.has(String(f.properties.id)));
    if (kind) near.push({ at, kind, d });
  }
  near.sort((a, b) => a.d - b.d);
  const features: GeoJSON.Feature<GeoJSON.Point, { label: string; d: number }>[] = [];
  const shown = new Set<string>();
  for (const e of near) {
    if (features.length >= max) break;
    const corner = cornerLine(placeAt(e.at));
    // Two stairs on one corner read the same; the nearer one speaks for both.
    const key = `${corner ?? ""}|${e.kind}`;
    if (shown.has(key)) continue;
    shown.add(key);
    const lines = corner ? (phone && e.d > closeM ? [corner] : [corner, e.kind]) : [e.kind];
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: e.at }, properties: { label: lines.join("\n"), d: Math.round(e.d) } });
  }
  return { type: "FeatureCollection", features };
}
