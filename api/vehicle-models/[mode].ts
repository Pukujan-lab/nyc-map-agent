import { pmtilesProxy } from "../city-tiles";

/**
 * GET /api/vehicle-models/:mode: the glTF model for one live-vehicle mode
 * (subway, bus, rail). The GLBs (Sketchfab, CC-BY, compressed with
 * gltf-transform; credits in public/models/LICENSE.md) are published through
 * Octo files to R2 as vehicle-<mode>.glb and served same-origin here, because
 * Octo's public bucket sends no CORS headers. Binaries never go in git.
 */
const VEHICLE_MODES = ["subway", "bus", "rail"] as const;
const proxies = new Map(VEHICLE_MODES.map((m) => [m, pmtilesProxy(`vehicle-${m}.glb`, "model/gltf-binary")]));

export async function GET(request: Request): Promise<Response> {
  const mode = new URL(request.url).pathname.split("/").pop() ?? "";
  const proxy = proxies.get(mode as (typeof VEHICLE_MODES)[number]);
  if (!proxy) return new Response(`unknown mode; use ${VEHICLE_MODES.join(", ")}`, { status: 404 });
  return proxy(request);
}
