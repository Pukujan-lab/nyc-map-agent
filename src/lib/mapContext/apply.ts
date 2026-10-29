import type { MapContext } from "./context";
import { focusMatch, focusRoutes, treatmentFor, type Treatment } from "./rules";

/**
 * Applies the rule table to a live map by temporarily overriding layer
 * visibility and opacity, and puts every value back on exit. The user's saved
 * toggles (URL, localStorage, React props) are never written: each override
 * remembers the value it replaced, and a value the app changes underneath us
 * (a theme swap, a prop change) becomes the new value to restore.
 */

/** The slice of a MapLibre map this module touches, so tests can pass a fake. */
export interface MapLike {
  getLayersOrder(): string[];
  getLayer(id: string): { type: string } | undefined;
  getLayoutProperty(id: string, prop: string): unknown;
  setLayoutProperty(id: string, prop: string, value: unknown): unknown;
  getPaintProperty(id: string, prop: string): unknown;
  setPaintProperty(id: string, prop: string, value: unknown): unknown;
}

export interface Op {
  layer: string;
  kind: "layout" | "paint";
  prop: string;
  /** The override, built from the value it replaces. */
  make: (original: unknown) => unknown;
}

export const DIM = 0.3;

const OPACITY: Record<string, string[]> = {
  line: ["line-opacity"],
  circle: ["circle-opacity", "circle-stroke-opacity"],
  symbol: ["icon-opacity", "text-opacity"],
  fill: ["fill-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  heatmap: ["heatmap-opacity"],
};
/** Paint properties that cannot vary per feature: focus there is not possible. */
const NO_DATA = new Set(["fill-extrusion-opacity", "heatmap-opacity"]);

const ZOOM_CURVES = new Set(["interpolate", "interpolate-hcl", "interpolate-lab", "step"]);
const isZoom = (v: unknown) => Array.isArray(v) && v.length === 1 && v[0] === "zoom";

/**
 * Rewrites an opacity value with `f`. A zoom curve must stay the top-level
 * expression, so `f` is applied to each of its stops instead. Pure.
 */
export function mapOpacity(v: unknown, f: (x: unknown) => unknown): unknown {
  const value = v === undefined || v === null ? 1 : v;
  if (Array.isArray(value) && ZOOM_CURVES.has(value[0] as string)) {
    const arr = value as unknown[];
    const step = arr[0] === "step";
    const input = step ? arr[1] : arr[2];
    if (isZoom(input)) {
      const first = step ? 2 : 4; // step: [op, input, v0, z1, v1…]; interpolate: [op, type, input, z0, v0…]
      return arr.map((x, i) => (i >= first && (i - first) % 2 === 0 ? f(x) : x));
    }
  }
  return f(value);
}

export const dimValue = (v: unknown, k = DIM): unknown =>
  mapOpacity(v, (x) => (typeof x === "number" ? Math.round(x * k * 1000) / 1000 : ["*", x, k]));

export const focusValue = (v: unknown, match: unknown[]): unknown => mapOpacity(v, (x) => ["case", match, x, 0]);

/** The overrides one context asks for, given the layers on the map. Pure. */
export function planOps(layers: { id: string; type: string }[], c: MapContext): Op[] {
  const route = c.kind === "following" ? c.route : null;
  const ops: Op[] = [];
  const hide = (layer: string) => ops.push({ layer, kind: "layout", prop: "visibility", make: () => "none" });
  for (const { id, type } of layers) {
    let t: Treatment = treatmentFor(id, c);
    if (t === "keep") continue;
    const props = OPACITY[type] ?? [];
    if (t === "focus") {
      const match = route ? focusMatch(id, focusRoutes(route)) : null;
      if (!match) { hide(id); continue; }
      if (!props.length || props.some((p) => NO_DATA.has(p))) continue; // e.g. the el viaduct: keep
      for (const prop of props) ops.push({ layer: id, kind: "paint", prop, make: (o) => focusValue(o, match) });
      continue;
    }
    if (t === "dim" && !props.length) t = "keep";
    if (t === "hide") hide(id);
    else if (t === "dim") for (const prop of props) ops.push({ layer: id, kind: "paint", prop, make: (o) => dimValue(o) });
  }
  return ops;
}

/** `original` is the app's intended value: what it last set, restored on exit. */
interface Rec { layer: string; kind: Op["kind"]; prop: string; original: unknown; applied: unknown; make: Op["make"] }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (o: { layer: string; kind: string; prop: string }) => `${o.layer}|${o.kind}|${o.prop}`;

type Setter = MapLike["setLayoutProperty"];

export class ContextOverrides {
  private recs = new Map<string, Rec>();
  private rawLayout: Setter;
  private rawPaint: Setter;

  /**
   * Wraps the map's setLayoutProperty / setPaintProperty so an app write to a
   * value we override (a toggle, a React prop change, readable.ts) is recorded
   * as the app's intended value: the override stays on top while the context
   * lasts, and exit restores the app's latest value, not the stale one.
   */
  constructor(private map: MapLike) {
    this.rawLayout = map.setLayoutProperty.bind(map);
    this.rawPaint = map.setPaintProperty.bind(map);
    map.setLayoutProperty = (id, prop, v) => this.intercept("layout", id, prop, v);
    map.setPaintProperty = (id, prop, v) => this.intercept("paint", id, prop, v);
  }

  private intercept(kind: Op["kind"], layer: string, prop: string, v: unknown): unknown {
    const raw = kind === "layout" ? this.rawLayout : this.rawPaint;
    const r = this.recs.get(keyOf({ layer, kind, prop }));
    if (!r) return raw(layer, prop, v);
    r.original = v;
    r.applied = r.make(v);
    return raw(layer, prop, r.applied);
  }

  /** Unwrap the map's setters. Call after restoreAll. */
  dispose(): void {
    this.map.setLayoutProperty = this.rawLayout;
    this.map.setPaintProperty = this.rawPaint;
  }

  private get(r: { layer: string; kind: Op["kind"]; prop: string }): unknown {
    return r.kind === "layout" ? this.map.getLayoutProperty(r.layer, r.prop) : this.map.getPaintProperty(r.layer, r.prop);
  }
  private set(r: { layer: string; kind: Op["kind"]; prop: string }, v: unknown): boolean {
    try {
      if (r.kind === "layout") this.rawLayout(r.layer, r.prop, v);
      else this.rawPaint(r.layer, r.prop, v);
      return true;
    } catch {
      return false; // a layer mid style-swap; the next sync retries
    }
  }

  /** Make the map match `ops`: restore what is no longer asked for, apply what is new. */
  sync(ops: Op[]): void {
    const wanted = new Map(ops.map((o) => [keyOf(o), o]));
    for (const [k, r] of this.recs) {
      if (wanted.has(k)) continue;
      this.recs.delete(k);
      if (!this.map.getLayer(r.layer)) continue;
      // If the app changed the value since, its value stands; otherwise put ours back.
      if (same(this.get(r), r.applied)) this.set(r, r.kind === "layout" && r.prop === "visibility" ? (r.original ?? "visible") : r.original);
    }
    for (const [k, o] of wanted) {
      if (!this.map.getLayer(o.layer)) { this.recs.delete(k); continue; }
      const cur = this.get(o);
      const prev = this.recs.get(k);
      const original = prev && same(cur, prev.applied) ? prev.original : cur;
      const applied = o.make(original);
      if (!same(cur, applied) && !this.set(o, applied)) continue;
      this.recs.set(k, { layer: o.layer, kind: o.kind, prop: o.prop, original, applied, make: o.make });
    }
  }

  restoreAll(): void {
    this.sync([]);
  }

  /** How many values are overridden right now (for tests and the dev console). */
  get size(): number {
    return this.recs.size;
  }
}

/** Layer ids and types in draw order. */
export function layersOf(map: MapLike): { id: string; type: string }[] {
  const out: { id: string; type: string }[] = [];
  for (const id of map.getLayersOrder()) {
    const l = map.getLayer(id);
    if (l) out.push({ id, type: l.type });
  }
  return out;
}
