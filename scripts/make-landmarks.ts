/**
 * Writes the hero landmark models (src/lib/map/landmarkModels.ts, CC0) as GLB:
 *   pnpm exec tsx scripts/make-landmarks.ts   -> public/models/landmarks/<id>.glb
 */
import { mkdirSync, writeFileSync } from "node:fs";

const g = globalThis as Record<string, unknown>;
g.window ??= globalThis;
// GLTFExporter reads Blobs with FileReader, which Node lacks.
g.FileReader ??= class {
  result: unknown = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`; this.onloadend?.(); }); }
};

const { landmarkGlbs } = await import("../src/lib/map/landmarkModels");
mkdirSync("public/models/landmarks", { recursive: true });
for (const [id, glb] of Object.entries(await landmarkGlbs())) {
  writeFileSync(`public/models/landmarks/${id}.glb`, Buffer.from(glb));
  console.log(id, glb.byteLength, "bytes");
}
