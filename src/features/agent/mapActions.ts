import { mapAction, type MapAction, type MapPoint, type RestroomSpot, type Trip } from "./schema";

/** What a tapped answer button can do to the map. Injected, so the runner is pure. */
export interface MapActionContext {
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  showTrip: (trip: Trip) => void;
  /** Fly to the restroom, turn the restroom layer on and open its card. */
  showRestroom: (restroom: RestroomSpot) => void;
  /** Draw named spots in one colour and fit the camera to them. */
  showPoints: (points: MapPoint[], style: { color: string; title: string }) => void;
  /** Hand the trip to the phone's calendar with an alert before it leaves. */
  remind: (trip: Trip) => void;
}

/** Skipped stations and crash hotspots read as trouble; a plain stop list uses the line's colour. */
export const SKIP_COLOR = "#dc2626";
export const CRASH_COLOR = "#ea580c";
/** MTA trouble (#361): the problem spot in red, shuttle buses in the MTA's shuttle blue, switch stations green, a stuck train amber. */
export const TROUBLE_COLOR: Record<Extract<MapAction, { kind: "showTrouble" }>["style"], string> = { problem: SKIP_COLOR, shuttle: "#0039a6", switch: "#16a34a", stuck: "#d97706" };

export type ActionResult = { ok: true; kind: MapAction["kind"] } | { ok: false; error: string };

/** Validate an action from the stream, then run it. Never throws. */
export function runMapAction(raw: unknown, ctx: MapActionContext, routeColor: (route: string) => string): ActionResult {
  const parsed = mapAction.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid action" };
  const a = parsed.data;
  try {
    switch (a.kind) {
      case "flyTo": ctx.flyTo(a.lon, a.lat, a.zoom); break;
      case "showRoute": ctx.showTrip(a.trip); break;
      case "showRestroom": ctx.showRestroom(a.restroom); break;
      case "showStops": ctx.showPoints(a.stops, { color: a.skipped ? SKIP_COLOR : a.color ?? routeColor(a.route), title: a.label }); break;
      case "showCrashes": ctx.showPoints(a.points, { color: CRASH_COLOR, title: a.label }); break;
      case "showTrouble": ctx.showPoints(a.points, { color: TROUBLE_COLOR[a.style], title: a.label }); break;
      case "remindTrip": ctx.remind(a.trip); break;
    }
    return { ok: true, kind: a.kind };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "action failed" };
  }
}

/** "350 m" / "1.2 km" for a restroom card. */
export function distanceText(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
