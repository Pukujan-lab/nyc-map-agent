/**
 * Route signs for the 3D train models: what each train's front and rear sign
 * shows, and a per-route cache of the drawn sign so every train on one line
 * shares one texture and each line gets its own. Free of three.js on purpose
 * (three stays in threeLayer.ts); the layer hands in the texture factory.
 */

export interface SignFace {
  /** Cache key: one texture per distinct face. */
  key: string;
  text: string;
  express: boolean;
  /** Bullet fill. */
  color: string;
  /** Letter colour: black on the yellow N/Q/R/W, white elsewhere. */
  ink: string;
}

/**
 * The bullet for a GTFS route id, same rules as the 2D bullets
 * (src/features/transit/bullets.ts in #178): express ids ending in X are a
 * diamond, shuttles read S, N/Q/R/W take black text. `color` is the feed's
 * own route colour (MTA bullet colour).
 */
export function signFace(route: string, color?: string): SignFace {
  const r = route.trim().toUpperCase();
  const express = /^[0-9A-Z]X$/.test(r);
  const text = express ? r.slice(0, 1) : r === "GS" || r === "FS" || r === "H" ? "S" : r || "?";
  const fill = (color || "#808183").toUpperCase();
  const ink = ["N", "Q", "R", "W"].includes(text) ? "#111111" : "#FFFFFF";
  return { key: `${text}|${express ? 1 : 0}|${fill}`, text, express, color: fill, ink };
}

/** Anything with a dispose(), e.g. a three.js texture or material. */
export interface Disposable { dispose(): void }

/**
 * One sign per face, created on first use and disposed once no train shows it.
 * `make` builds the GPU resources for a face; `sync` is called once per frame
 * of vehicle updates with the faces in use.
 */
export class RouteSignCache<T extends Disposable> {
  private readonly entries = new Map<string, T>();
  constructor(private readonly make: (face: SignFace) => T) {}

  get(face: SignFace): T {
    let e = this.entries.get(face.key);
    if (!e) { e = this.make(face); this.entries.set(face.key, e); }
    return e;
  }

  /** Dispose every cached sign whose key is not in `inUse`; returns the evicted keys. */
  prune(inUse: Set<string>): string[] {
    const gone: string[] = [];
    for (const [k, e] of this.entries) if (!inUse.has(k)) { e.dispose(); this.entries.delete(k); gone.push(k); }
    return gone;
  }

  clear(): void { this.prune(new Set()); }
  get size(): number { return this.entries.size; }
}

/** Draws a face onto a square 2D canvas: the line-colour bullet with its letter. */
export function drawSignFace(ctx: CanvasRenderingContext2D, face: SignFace, size: number): void {
  const c = size / 2, r = size / 2 - size * 0.06;
  ctx.fillStyle = "#111111"; // the sign box behind the bullet
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  if (face.express) { ctx.moveTo(c, c - r); ctx.lineTo(c + r, c); ctx.lineTo(c, c + r); ctx.lineTo(c - r, c); ctx.closePath(); }
  else ctx.arc(c, c, r * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = face.color;
  ctx.fill();
  ctx.fillStyle = face.ink;
  ctx.font = `bold ${Math.round(size * (face.text.length > 1 ? 0.42 : 0.6))}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(face.text, c, c + size * 0.03);
}
