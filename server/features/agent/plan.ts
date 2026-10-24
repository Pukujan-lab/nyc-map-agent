/** Trip search: OpenTripPlanner first (top 3, all modes), built-in subway router if OTP is down. */
import type { LngLatTuple, Trip } from "../../../src/features/agent/schema";
import { hazardsAt, weatherAt } from "./services";
import { httpOtp, itineraryToTrip, rankItineraries, type OtpClient } from "./otp";
import { buildTrip, nyLocalToDate, safe, toNyLocal, tripSkips, type TripDeps } from "./trip";

export interface PlanDeps extends TripDeps { otp?: OtpClient | null }
type Place = { label: string; at: LngLatTuple };

export async function planTrip(origin: Place, destination: Place, local: string, arriveBy: boolean, deps: PlanDeps = {}): Promise<Trip> {
  const otp = deps.otp === undefined ? httpOtp : deps.otp;
  const its = otp ? await safe(otp.plan(origin.at, destination.at, local, arriveBy), []) : [];
  const top = rankItineraries(its, 3, arriveBy);
  if (!top.length) {
    // Fallback router only knows depart-at; approximate arrive-by with a 75 min lead.
    const dep = arriveBy ? toNyLocal(new Date(nyLocalToDate(local).getTime() - 75 * 60_000)) : local;
    return buildTrip(origin, destination, dep, deps);
  }
  const trips = await Promise.all(top.map((i) => itineraryToTrip(i, origin, destination, deps.entrances)));
  const [weather, hazards, skips] = await Promise.all([
    safe(weatherAt(origin.at, trips[0].departIso), null),
    safe(hazardsAt(origin.at), [] as string[]),
    safe(tripSkips([...new Set(trips.flatMap((t) => t.routes))], trips[0].departIso, deps), [] as Trip["skips"]),
  ]);
  for (const t of trips) { t.weather = weather; t.hazards = hazards; t.skips = skips.filter((s) => t.routes.some((r) => r.replace(/X$/, "") === s.route)); }
  return { ...trips[0], alternatives: trips.slice(1) };
}
