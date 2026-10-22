/**
 * Where street furniture stands, in metres east/north of a point. Pure, no
 * three.js, so it is unit-tested and the layers stay thin.
 */

/** Unit vector (east, north) for a compass bearing in degrees. */
export function dirOf(bearing: number): [number, number] {
  const b = (bearing * Math.PI) / 180;
  return [Math.sin(b), Math.cos(b)];
}

/**
 * The corner pole for two crossing centrelines with bearings `ba` and `bb`:
 * on the bisector of the two street directions, at `setback` metres from
 * *each* centreline (half a typical roadway plus the curb), so it lands on the
 * sidewalk corner for any crossing angle instead of in the road or a facade.
 */
export function cornerOffset(ba: number, bb: number, setback = 6.5, maxM = 14): [number, number] {
  const ua = dirOf(ba);
  const ub = dirOf(bb);
  const sin = Math.abs(ua[0] * ub[1] - ua[1] * ub[0]);
  const sum: [number, number] = [ua[0] + ub[0], ua[1] + ub[1]];
  const len = Math.hypot(sum[0], sum[1]);
  if (sin < 0.15 || len < 1e-6) return [0, 0]; // near-parallel: no real corner
  // Perpendicular distance from line A of t * (ua + ub) is t * sin.
  let t = setback / sin;
  if (t * len > maxM) t = maxM / len;
  return [sum[0] * t, sum[1] * t];
}

/** Local metres of a lng/lat relative to an origin. */
export function toLocal(lng: number, lat: number, o: { lng: number; lat: number }): [number, number] {
  const kx = 111_320 * Math.cos((o.lat * Math.PI) / 180);
  return [(lng - o.lng) * kx, (lat - o.lat) * 111_320];
}

/** Nearest segment bearing (degrees) of any line within `maxM` of a point, or null. */
export function streetBearingAt(lines: Array<Array<[number, number]>>, lng: number, lat: number, maxM = 30): number | null {
  const o = { lng, lat };
  let best = maxM;
  let brg: number | null = null;
  for (const l of lines) {
    for (let i = 1; i < l.length; i++) {
      const a = toLocal(l[i - 1][0], l[i - 1][1], o);
      const b = toLocal(l[i][0], l[i][1], o);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / l2));
      const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
      if (d < best) {
        best = d;
        brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      }
    }
  }
  return brg;
}

export interface NamedStreet {
  name: string;
  coords: Array<[number, number]>;
}

interface Crossing {
  lng: number;
  lat: number;
  /** Street names as the blades print them ("Grand St"). */
  a: string;
  b: string;
  /** Bearings of the two streets at the crossing, degrees. */
  ba: number;
  bb: number;
  d: number;
}

/** Blade spelling, as on real NYC signs: "West 44th Street" → "W 44 St". */
export function bladeName(name: string): string {
  return name
    .replace(/\bStreet\b/gi, "St")
    .replace(/\bAvenue\b/gi, "Av")
    .replace(/\bBoulevard\b/gi, "Blvd")
    .replace(/\bPlace\b/gi, "Pl")
    .replace(/\bRoad\b/gi, "Rd")
    .replace(/\bDrive\b/gi, "Dr")
    .replace(/\bParkway\b/gi, "Pkwy")
    .replace(/\bSquare\b/gi, "Sq")
    .replace(/\bLane\b/gi, "Ln")
    .replace(/\bTerrace\b/gi, "Ter")
    .replace(/\bCourt\b/gi, "Ct")
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
    .replace(/^(East|West|North|South)\b(?=\s)/i, (w) => w[0].toUpperCase())
    .trim();
}

/**
 * Street crossings near a point, from named centrelines: where segments of two
 * differently named streets intersect (or end within 2 m of each other),
 * merged within 12 m. Nearest first.
 */
export function crossingsNear(lines: NamedStreet[], at: { lng: number; lat: number }, radius = 220, max = 40): Crossing[] {
  type Seg = { name: string; ax: number; ay: number; bx: number; by: number };
  const segs: Seg[] = [];
  const r2 = (radius + 60) ** 2;
  for (const l of lines) {
    if (!l.name) continue;
    for (let i = 1; i < l.coords.length; i++) {
      const [ax, ay] = toLocal(l.coords[i - 1][0], l.coords[i - 1][1], at);
      const [bx, by] = toLocal(l.coords[i][0], l.coords[i][1], at);
      const R = Math.sqrt(r2);
      if ((ax > R && bx > R) || (ax < -R && bx < -R) || (ay > R && by > R) || (ay < -R && by < -R)) continue;
      segs.push({ name: l.name, ax, ay, bx, by });
    }
  }
  const found: Array<{ x: number; y: number; a: Seg; b: Seg }> = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j];
      if (t.name === s.name) continue;
      const p = segHit(s, t);
      if (p && p[0] * p[0] + p[1] * p[1] <= radius * radius) found.push({ x: p[0], y: p[1], a: s, b: t });
    }
  }
  const out: Array<Crossing & { x: number; y: number; pair: string }> = [];
  const kx = 111_320 * Math.cos((at.lat * Math.PI) / 180);
  for (const f of found) {
    // Dual carriageways (Delancey, Houston) cross twice: one corner for the pair within 25 m.
    const pair = [f.a.name, f.b.name].sort().join("|");
    if (out.some((o) => Math.hypot(o.x - f.x, o.y - f.y) < (o.pair === pair ? 25 : 12))) continue;
    const brg = (s: Seg) => ((Math.atan2(s.bx - s.ax, s.by - s.ay) * 180) / Math.PI + 360) % 360;
    out.push({
      pair,
      x: f.x,
      y: f.y,
      lng: at.lng + f.x / kx,
      lat: at.lat + f.y / 111_320,
      a: bladeName(f.a.name),
      b: bladeName(f.b.name),
      ba: brg(f.a),
      bb: brg(f.b),
      d: Math.hypot(f.x, f.y),
    });
  }
  return out
    .sort((p, q) => p.d - q.d)
    .slice(0, max)
    .map((c) => ({ lng: c.lng, lat: c.lat, a: c.a, b: c.b, ba: c.ba, bb: c.bb, d: c.d }));
}

function segHit(s: { ax: number; ay: number; bx: number; by: number }, t: { ax: number; ay: number; bx: number; by: number }): [number, number] | null {
  const rx = s.bx - s.ax, ry = s.by - s.ay, qx = t.bx - t.ax, qy = t.by - t.ay;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) > 1e-9) {
    const u = ((t.ax - s.ax) * qy - (t.ay - s.ay) * qx) / den;
    const v = ((t.ax - s.ax) * ry - (t.ay - s.ay) * rx) / den;
    const lr = Math.hypot(rx, ry) || 1, lq = Math.hypot(qx, qy) || 1;
    // A little slack (2 m) so ways that stop at the crossing still meet.
    if (u >= -2 / lr && u <= 1 + 2 / lr && v >= -2 / lq && v <= 1 + 2 / lq) return [s.ax + u * rx, s.ay + u * ry];
  }
  return null;
}
