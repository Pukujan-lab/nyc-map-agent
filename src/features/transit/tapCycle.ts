/**
 * Repeated taps on one spot step through what is there (owner, 2026-10-25):
 * each train in turn, then the station. One train at a station: train, then
 * station. Three trains: train one, two, three, then the station.
 */
type Hit = { layer: { id: string }; properties: Record<string, unknown> | null };
type Point = { x: number; y: number };

const SKIP_LAYERS = new Set(["transit-skip", "transit-alert-skipped"]);

/** Trains and buses first (one entry each), then the one place under them; a station wins over its skip marker. */
export function tapTargets<T extends Hit>(hits: readonly T[]): T[] {
  const vehicles = new Map<string, T>();
  for (const h of hits) {
    const key = h.properties?.key;
    if (typeof key === "string" && key && !vehicles.has(key)) vehicles.set(key, h);
  }
  const places = hits.filter((h) => !(typeof h.properties?.key === "string" && h.properties.key));
  const place = places.find((h) => !SKIP_LAYERS.has(h.layer.id)) ?? places[0];
  return [...vehicles.values(), ...(place ? [place] : [])];
}

const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= 10;
const sig = (hs: readonly Hit[]) => hs.map((h) => `${h.layer.id}|${JSON.stringify(h.properties?.key ?? h.properties?.id ?? "")}`).join(",");

export class TapCycle {
  private at: Point | null = null;
  private seen = "";
  private i = 0;

  /** What this tap picks: the next target when the spot and what's under it are unchanged, otherwise the first. */
  next<T extends Hit>(point: Point, hits: readonly T[]): T | undefined {
    const targets = tapTargets(hits);
    const s = sig(targets);
    this.i = this.at && near(this.at, point) && s === this.seen && targets.length > 1 ? (this.i + 1) % targets.length : 0;
    this.at = { x: point.x, y: point.y };
    this.seen = s;
    return targets[this.i];
  }
}
