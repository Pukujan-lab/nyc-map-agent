/** Cross-feature handoff from a chosen trip to a real vehicle already on the map. */
export interface RouteFollowRequest {
  system: "subway" | "bus";
  route: string;
  at: [number, number];
}
type Candidate = { key: string; system: string; route: string; lon: number; lat: number };

/** Nearest matching vehicle to the boarding point; never choose another line or system. */
export function pickRouteVehicle<T extends Candidate>(vehicles: readonly T[], request: RouteFollowRequest): T | null {
  const routeId = (route: string) => request.system === "subway" ? route.toUpperCase().replace(/X$/, "") : route.toUpperCase();
  const kx = Math.cos(request.at[1] * Math.PI / 180);
  const distance = (v: T) => Math.hypot((v.lon - request.at[0]) * kx, v.lat - request.at[1]);
  return vehicles.filter((v) => v.system === request.system && routeId(v.route) === routeId(request.route))
    .reduce<T | null>((best, v) => !best || distance(v) < distance(best) ? v : best, null);
}

let follow: ((request: RouteFollowRequest) => boolean) | null = null;
export function registerRouteFollower(handler: typeof follow): void { follow = handler; }
/** False leaves the caller free to show the line or ask for the next service. */
export function followTripRoute(request: RouteFollowRequest): boolean { return follow?.(request) ?? false; }
