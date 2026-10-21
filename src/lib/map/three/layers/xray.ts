/** X-ray station view: a station's insides drawn through a dimmed ground disc. */
import * as THREE from "three";
import { toLocal, type Frame } from "../projection";

/**
 * X-ray primitive (a station's insides, drawn through a dimmed ground):
 * "area" = flat polygon, "ribbon" = a polyline of `width` m with per-vertex z
 * (stairs slope), "shaft" = a vertical box from pts[0].z up to 0.
 * Higher `order` draws later (on top), so shallower levels read over deeper ones.
 */
export interface XrayPrim {
  kind: "area" | "ribbon" | "shaft";
  pts: Array<[number, number, number]>;
  width: number;
  color: string;
  order: number;
}
export const XRAY_GROUND_RADIUS = 170;

const seeThrough = (color: string, opacity: number, order: number) => {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  return (g: THREE.BufferGeometry) => { const m = new THREE.Mesh(g, mat); m.renderOrder = order; m.frustumCulled = false; return m; };
};

/** A flat strip `width` m wide along `pts` (per-vertex z kept). */
function ribbon(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = new THREE.Vector3(b.x - a.x, b.y - a.y, 0).normalize(), n = new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(width / 2);
    const q1 = a.clone().add(n), q2 = a.clone().sub(n), q3 = b.clone().add(n), q4 = b.clone().sub(n);
    pos.push(q1.x, q1.y, q1.z, q2.x, q2.y, q2.z, q3.x, q3.y, q3.z, q3.x, q3.y, q3.z, q2.x, q2.y, q2.z, q4.x, q4.y, q4.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** One station's insides around `center`. */
export function buildXray(f: Frame, center: [number, number], prims: XrayPrim[]): THREE.Group {
  const toV = (lon: number, lat: number, z: number) => new THREE.Vector3(...toLocal(f, lon, lat), z);
  const xray = new THREE.Group();
  const c = toV(center[0], center[1], 0.3);
  xray.add(seeThrough("#0b1220", 0.6, 1)(new THREE.CircleGeometry(XRAY_GROUND_RADIUS, 48).translate(c.x, c.y, c.z)));
  for (const p of prims) {
    const v = p.pts.map(([lon, lat, z]) => toV(lon, lat, z));
    const mk = seeThrough(p.color, p.kind === "area" ? 0.75 : 0.95, 2 + p.order);
    if (p.kind === "area" && v.length >= 3) {
      const g = new THREE.ShapeGeometry(new THREE.Shape(v.map((q) => new THREE.Vector2(q.x, q.y))));
      xray.add(mk(g.translate(0, 0, v[0].z)));
      xray.add(mk(ribbon([...v, v[0]], 0.4))); // crisp edge
    } else if (p.kind === "shaft") {
      const h = Math.max(-v[0].z, 1);
      xray.add(mk(new THREE.BoxGeometry(p.width, p.width, h).translate(v[0].x, v[0].y, v[0].z + h / 2)));
    } else if (v.length >= 2) xray.add(mk(ribbon(v, p.width)));
  }
  return xray;
}

/** Free an x-ray group's GPU resources. */
export function disposeXray(xray: THREE.Group): void {
  for (const o of xray.children as THREE.Mesh[]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
}
