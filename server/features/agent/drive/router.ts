/**
 * Car routing behind an adapter. Default: the public FOSSGIS OSRM car server,
 * which is for light use only — set DRIVE_ROUTER_URL to a self-hosted OSRM, or
 * implement `DriveRouter` for Valhalla, before real traffic (docs/MODULES.md).
 */
import { z } from "zod";
import type { LngLatTuple } from "../../../../src/features/agent/schema";

export interface DriveRoute { coords: LngLatTuple[]; distanceM: number; durationS: number; turns: Array<{ at: LngLatTuple; text: string }> }
export interface DriveRouter { route(a: LngLatTuple, b: LngLatTuple): Promise<DriveRoute> }

const lane = z.object({ valid: z.boolean(), indications: z.array(z.string()) });
const step = z.object({
  name: z.string(),
  ref: z.string().optional(),
  maneuver: z.object({ type: z.string(), modifier: z.string().optional(), location: z.tuple([z.number(), z.number()]), exit: z.number().optional() }),
  intersections: z.array(z.object({ lanes: z.array(lane).optional() })).default([]),
});
const osrm = z.object({ routes: z.array(z.object({ distance: z.number(), duration: z.number(), geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }), legs: z.array(z.object({ steps: z.array(step) })) })).min(1) });

/** "Turn left onto E 9 St — use the left lane" from an OSRM step, or null for a non-decision step. */
export function describeStep(s: z.infer<typeof step>): string | null {
  const { type, modifier, exit } = s.maneuver;
  if (["depart", "arrive", "new name", "continue", "notification"].includes(type) && !(type === "continue" && modifier && modifier !== "straight")) return null;
  const road = s.ref ? `${s.name || s.ref} (${s.ref})` : s.name || "the road";
  const verb =
    type === "roundabout" || type === "rotary" ? `At the roundabout take exit ${exit ?? ""}`.trim()
      : type === "merge" ? `Merge ${modifier ?? ""}`
        : type === "on ramp" ? `Take the ramp ${modifier ?? ""}`
          : type === "off ramp" ? `Take the exit ${modifier ?? ""}`
            : type === "fork" ? `Keep ${modifier ?? ""} at the fork`
              : `Turn ${modifier ?? ""}`;
  const lanes = s.intersections[0]?.lanes;
  let hint = "";
  if (lanes && lanes.length > 1) {
    const valid = lanes.map((l, i) => (l.valid ? i : -1)).filter((i) => i >= 0);
    if (valid.length && valid.length < lanes.length) {
      const pos = valid.every((i) => i < lanes.length / 2) ? "left" : valid.every((i) => i >= lanes.length / 2) ? "right" : "middle";
      hint = ` — use the ${pos} ${valid.length === 1 ? "lane" : `${valid.length} lanes`}`;
    }
  }
  return `${verb} onto ${road}${hint}`.replace(/\s+/g, " ");
}

export function osrmCar(baseUrl = process.env.DRIVE_ROUTER_URL ?? "https://routing.openstreetmap.de/routed-car"): DriveRouter {
  const base = baseUrl.replace(/\/$/, "");
  return {
    async route(a, b) {
      const c = `${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}`;
      const res = await fetch(`${base}/route/v1/driving/${c}?overview=full&geometries=geojson&steps=true`, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "nyc-map-agent" } });
      if (!res.ok) throw new Error(`car router returned ${res.status}`);
      const r = osrm.parse(await res.json()).routes[0];
      const turns = r.legs.flatMap((l) => l.steps.flatMap((s) => { const t = describeStep(s); return t ? [{ at: s.maneuver.location, text: t }] : []; }));
      return { coords: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration, turns };
    },
  };
}
