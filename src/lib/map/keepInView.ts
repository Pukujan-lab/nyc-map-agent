import type { Map as MapLibreMap } from "maplibre-gl";
import type { Insets } from "./mapCover";

/** How close to the edge of the clear map area, as a share of its width and height, before the map re-centres. */
export const EDGE_SHARE = 0.2;
const MIN_EDGE_PX = 24;
const GLIDE_MS = 800;

/**
 * True when a screen point is outside the clear map area (the map minus its
 * padding for open panels) or within `share` of that area's edge. Pure, for tests.
 */
export function nearEdge(p: { x: number; y: number }, width: number, height: number, pad: Insets, share = EDGE_SHARE): boolean {
  const mx = Math.max(MIN_EDGE_PX, (width - pad.left - pad.right) * share);
  const my = Math.max(MIN_EDGE_PX, (height - pad.top - pad.bottom) * share);
  return p.x < pad.left + mx || p.x > width - pad.right - mx || p.y < pad.top + my || p.y > height - pad.bottom - my;
}

const tilted = (map: MapLibreMap) => Math.abs(map.getPitch()) > 0.5 || Math.abs((((map.getBearing() % 360) + 540) % 360) - 180) > 0.5;

/**
 * The calm follow camera: a fixed top-down map, north up. The map stays still
 * while the focus (you, a followed train or bus, a trip preview marker) moves,
 * and glides once to put it back in the middle of the clear area when it nears
 * the edge or the map is tilted or turned. Safe to call on every position update:
 * nothing moves while a glide or a drag is already under way.
 * Returns true when it started a glide.
 */
export function keepInView(map: MapLibreMap, at: [number, number]): boolean {
  if (map.isMoving()) return false;
  const box = map.getContainer();
  const p = map.getPadding();
  const pad = { top: p.top ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0, right: p.right ?? 0 };
  if (!tilted(map) && !nearEdge(map.project(at), box.clientWidth, box.clientHeight, pad)) return false;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  map.easeTo({ center: at, pitch: 0, bearing: 0, duration: reduce ? 0 : GLIDE_MS });
  return true;
}
