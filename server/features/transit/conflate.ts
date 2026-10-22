/**
 * Snaps Bus Time route polylines onto NYC street centerlines (DCP CSCL, NYC
 * Open Data inkn-q76z) and works out how far right of the centerline the bus
 * travel lane is, so buses draw on the road rather than on a sidewalk.
 *
 * Each shape vertex moves to the nearest centerline within SNAP_M whose
 * direction matches (undirected, within 35°); vertices with no match (bridges,
 * busways, depots) keep their place and a 0 m offset. The right-hand offset is
 * a quarter of the street width on two-way streets (middle of the right
 * half) and the curb lane on one-way streets.
 */
export type Centerline = { coords: Array<[number, number]>; twoWay: boolean; widthM: number };
type LonLat = [number, number];

const SNAP_M = 18, KY = 111_320, CELL = 0.001;

export function laneOffset(c: Pick<Centerline, "twoWay" | "widthM">): number {
  const w = c.widthM > 0 ? c.widthM : 10;
  return c.twoWay ? Math.min(6, Math.max(1.8, w / 4)) : Math.min(6, Math.max(0, w / 2 - 4));
}

export function conflate(lines: LonLat[][], streets: Centerline[]): { lines: LonLat[][]; offsets: number[][] } {
  if (!streets.length) return { lines, offsets: lines.map((l) => l.map(() => 0)) };
  const kx = KY * Math.cos((40.7 * Math.PI) / 180);
  type Seg = { a: LonLat; b: LonLat; c: Centerline };
  const grid = new Map<string, Seg[]>();
  const cell = (lon: number, lat: number) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;
  for (const c of streets) for (let i = 1; i < c.coords.length; i++) {
    const seg = { a: c.coords[i - 1], b: c.coords[i], c };
    const keys = new Set<string>();
    const n = Math.ceil(Math.hypot((seg.b[0] - seg.a[0]) * kx, (seg.b[1] - seg.a[1]) * KY) / 50) + 1;
    for (let k = 0; k <= n; k++) { const u = k / n; keys.add(cell(seg.a[0] + u * (seg.b[0] - seg.a[0]), seg.a[1] + u * (seg.b[1] - seg.a[1]))); }
    for (const key of keys) { let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(seg); }
  }
  const outLines: LonLat[][] = [], offsets: number[][] = [];
  for (const line of lines) {
    const ol: LonLat[] = [], oo: number[] = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i], q = line[Math.max(0, i - 1)], r = line[Math.min(line.length - 1, i + 1)];
      const dir = Math.atan2((r[0] - q[0]) * kx, (r[1] - q[1]) * KY);
      let best: { d: number; pt: LonLat; c: Centerline } | undefined;
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const s of grid.get(`${gx},${gy}`) ?? []) {
        const ax = (s.a[0] - p[0]) * kx, ay = (s.a[1] - p[1]) * KY, dx = (s.b[0] - s.a[0]) * kx, dy = (s.b[1] - s.a[1]) * KY;
        const l2 = dx * dx + dy * dy; if (!l2) continue;
        let diff = Math.abs(Math.atan2(dx, dy) - dir) % Math.PI; diff = Math.min(diff, Math.PI - diff);
        if (line.length > 1 && diff > (35 * Math.PI) / 180) continue;
        const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
        const d = Math.hypot(ax + u * dx, ay + u * dy);
        if (d < SNAP_M && (!best || d < best.d)) best = { d, pt: [s.a[0] + u * (s.b[0] - s.a[0]), s.a[1] + u * (s.b[1] - s.a[1])], c: s.c };
      }
      ol.push(best ? [Math.round(best.pt[0] * 1e6) / 1e6, Math.round(best.pt[1] * 1e6) / 1e6] : p);
      oo.push(best ? Math.round(laneOffset(best.c) * 10) / 10 : 0);
    }
    outLines.push(ol); offsets.push(oo);
  }
  return { lines: outLines, offsets };
}

const CSCL = "https://data.cityofnewyork.us/resource/inkn-q76z.json";

/** Street centerlines in a bbox (roadways only); [] on any failure so callers keep raw shapes. */
export async function loadCenterlines(bbox: [number, number, number, number]): Promise<Centerline[]> {
  const [w, s, e, n] = bbox.map((x, i) => x + (i < 2 ? -0.0005 : 0.0005));
  const qs = new URLSearchParams({
    $select: "the_geom,trafdir,streetwidth",
    $where: `within_box(the_geom, ${n}, ${w}, ${s}, ${e}) AND rw_type = '1'`,
    $limit: "50000",
  });
  try {
    const r = await fetch(`${CSCL}?${qs}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return [];
    const rows = (await r.json()) as Array<{ the_geom?: { type: string; coordinates: LonLat[][] }; trafdir?: string; streetwidth?: string }>;
    const out: Centerline[] = [];
    for (const row of rows) for (const coords of row.the_geom?.coordinates ?? []) {
      if (coords.length > 1) out.push({ coords, twoWay: row.trafdir === "TW", widthM: Number(row.streetwidth ?? 0) * 0.3048 });
    }
    return out;
  } catch {
    return [];
  }
}
