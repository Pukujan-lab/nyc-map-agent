/**
 * Builds the hero landmark models as small binary glTF (GLB) files, authored
 * here from published dimensions (CC0, no third-party meshes):
 *   node scripts/make-landmarks.mjs   -> public/models/landmarks/<id>.glb
 * Units are metres; +z up, +y along the landmark's bearing (see src/lib/map/landmarks.ts).
 * Low-poly massing only (setbacks, crowns, spires), flat materials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

globalThis.window ??= globalThis;
// GLTFExporter reads Blobs with FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`; this.onloadend?.(); }); }
};

const mat = (c, metal = 0.1, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough });
const LIME = mat(0xc9bfae), STEEL = mat(0xc7ccd2, 0.7, 0.35), GLASS = mat(0x6f90ab, 0.4, 0.25), DARK = mat(0x3b4148);
const COPPER = mat(0x6fb3a0, 0.3, 0.6), STONE = mat(0xb9ae9a);

/** Box w (x) by d (y), from z0 to z1. */
function box(g, w, d, z0, z1, m) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, d, z1 - z0), m);
  b.position.z = (z0 + z1) / 2;
  g.add(b);
}
/** Vertical frustum/cylinder with `seg` sides, radii r0 (bottom) r1 (top). */
function cyl(g, r0, r1, z0, z1, m, seg = 8, rot = 0) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), m);
  c.rotation.x = Math.PI / 2; // cylinder axis y -> z
  c.rotation.y = rot;
  c.position.z = (z0 + z1) / 2;
  g.add(c);
}

const models = {
  "empire-state"() {
    const g = new THREE.Group();
    box(g, 57, 129, 0, 25, LIME);       // 5-storey base on the full lot
    box(g, 50, 90, 25, 81, LIME);       // first setback
    box(g, 42, 60, 81, 260, LIME);      // shaft
    box(g, 36, 50, 260, 320, LIME);     // upper setbacks
    box(g, 28, 36, 320, 373, LIME);     // 86th-floor observatory and crown
    cyl(g, 9, 7, 373, 395, STEEL, 8);   // mooring mast
    cyl(g, 2.5, 0.5, 395, 443, STEEL, 6); // antenna
    return g;
  },
  chrysler() {
    const g = new THREE.Group();
    box(g, 61, 61, 0, 60, STONE);
    box(g, 46, 46, 60, 120, STONE);
    box(g, 38, 38, 120, 240, STONE);
    // Terraced steel crown: shrinking rings, then the needle.
    for (let i = 0; i < 6; i++) cyl(g, 17 - i * 2.4, 15 - i * 2.4, 240 + i * 9, 249 + i * 9, STEEL, 16);
    cyl(g, 3, 0.3, 294, 319, STEEL, 8);
    return g;
  },
  "one-wtc"() {
    const g = new THREE.Group();
    box(g, 61, 61, 0, 57, DARK);                         // podium
    cyl(g, 43, 21.5, 57, 386, GLASS, 4, Math.PI / 4);    // tapering square shaft (rotated 45° at top reads as the chamfers)
    cyl(g, 21.5, 21.5, 386, 417, GLASS, 4, 0);           // parapet
    cyl(g, 1.8, 0.4, 417, 541, STEEL, 6);                // spire
    return g;
  },
  liberty() {
    const g = new THREE.Group();
    // Fort Wood star base, pedestal, statue (robe, raised arm with torch).
    cyl(g, 60, 60, 0, 8, STONE, 11);
    box(g, 20, 20, 8, 27, STONE);
    box(g, 13, 13, 27, 47, STONE);
    cyl(g, 7, 4.2, 47, 80, COPPER, 10);
    cyl(g, 3, 2.2, 80, 86, COPPER, 8);                   // head and crown
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 13, 6), COPPER);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(3.5, 0, 85);
    g.add(arm);
    cyl(g, 1.8, 2.6, 91, 93, mat(0xe8c15a, 0.6, 0.4), 8); // torch flame
    return g;
  },
};

mkdirSync("public/models/landmarks", { recursive: true });
const exporter = new GLTFExporter();
for (const [id, make] of Object.entries(models)) {
  const scene = new THREE.Scene();
  scene.add(make());
  const glb = await new Promise((res) => exporter.parse(scene, res, { binary: true }));
  writeFileSync(`public/models/landmarks/${id}.glb`, Buffer.from(glb));
  console.log(id, glb.byteLength, "bytes");
}
