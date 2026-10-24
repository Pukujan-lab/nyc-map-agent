import type { LngLatTuple, Trip } from "../../../../src/features/agent/schema";
import { hazardsAt, weatherAt } from "../services";
import { nyLocalToDate, toNyLocal } from "../trip";
import { closures, crashHotspots, eventClosures, NOT_WIRED, ny511, slowSegments, tolls, type Note } from "./context";
import { osrmCar, type DriveRouter } from "./router";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export async function buildDriveTrip(
  origin: { label: string; at: LngLatTuple },
  destination: { label: string; at: LngLatTuple },
  departLocal: string,
  router: DriveRouter = osrmCar(),
): Promise<Trip> {
  const depart = nyLocalToDate(departLocal);
  const r = await router.route(origin.at, destination.at);
  const live = Math.abs(depart.getTime() - Date.now()) < 2 * 3600_000;
  const [slow, close, events, n511, crashes, weather, hazards] = await Promise.all([
    live ? safe(slowSegments(r.coords), [] as Note[]) : Promise.resolve([] as Note[]),
    safe(closures(r.coords, toNyLocal(depart)), [] as Note[]),
    safe(eventClosures(toNyLocal(depart), r.turns.map((t) => t.text.replace(/^.* onto /, "").replace(/ — .*$/, ""))), [] as Note[]),
    safe(ny511(r.coords), { notes: [] as Note[], stub: "511NY unavailable." }),
    safe(crashHotspots(r.coords), [] as Note[]),
    safe(weatherAt(origin.at, toNyLocal(depart)), null),
    safe(hazardsAt(origin.at), [] as string[]),
  ]);
  const stubbed = [
    "Drive ETA is OSRM free-flow time (public demo router, light use only); live speeds apply only within 2 h of now.",
    ...(n511.stub ? [n511.stub] : []),
    ...NOT_WIRED,
  ];
  return {
    id: crypto.randomUUID(),
    mode: "drive",
    origin, destination,
    departIso: toNyLocal(depart),
    arriveIso: toNyLocal(new Date(depart.getTime() + r.durationS * 1000)),
    legs: [{ kind: "drive", label: `Drive to ${destination.label}`, coords: r.coords, durationS: r.durationS, distanceM: r.distanceM, turns: r.turns }],
    routes: [],
    alerts: [], elevators: [], hazards,
    weather,
    exitAdvice: null,
    context: [...slow, ...close, ...events, ...n511.notes, ...tolls(r.coords), ...crashes],
    skips: [],
    stubbed,
    alternatives: [],
  };
}
