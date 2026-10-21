import { Footprints, MapPin, Navigation, X } from "lucide-react";
import { AddressCombobox } from "@/components/AddressCombobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WalkingRoute } from "@/lib/api/routing";
import { formatCount } from "@/lib/format";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";

function formatDistance(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} km`
    : `${formatCount(metres)} m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/**
 * Walking directions card. Shown while picking points or once a route exists;
 * otherwise the map stays clear.
 */
export function RoutePanel({
  route,
  isLoading,
  error,
}: {
  route: WalkingRoute | null;
  isLoading: boolean;
  error: string | null;
}) {
  const {
    routeStart,
    routeEnd,
    routePicking,
    setRoutePicking,
    setRoutePoint,
    clearRoute,
    followingRoute,
    setFollowingRoute,
  } = useDataView();
  const { startWalk, stopWalk, walking } = useMapState();

  if (!routeStart && !routeEnd && !routePicking) return null;

  const follow = () => {
    if (!route || !routeStart) return;
    if (followingRoute) {
      setFollowingRoute(false);
      return;
    }
    const [lon, lat] = route.coordinates[0] ?? [routeStart.lon, routeStart.lat];
    startWalk({ lon, lat });
    setFollowingRoute(true);
  };

  return (
    // Below the loading chip; lower still while walking, where the two-line
    // street-level strip spans a phone's full width at the top.
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3",
        walking ? "top-[5.5rem] sm:top-14" : "top-14",
      )}
    >
      <Card className="pointer-events-auto w-full max-w-sm p-3 text-xs shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <Navigation className="h-3.5 w-3.5 text-primary" />
            Walking directions
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Clear walking directions"
            className="h-6 w-6"
            onClick={() => {
              if (followingRoute && walking) stopWalk();
              clearRoute();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-2 space-y-1.5">
          {(["start", "end"] as const).map((end) => {
            const point = end === "start" ? routeStart : routeEnd;
            const picking = routePicking === end;
            const name = end === "start" ? "A" : "B";
            return (
              <div key={end} className="flex items-center gap-1.5">
                <AddressCombobox
                  label={`${name} address`}
                  placeholder={
                    picking ? "Click the map…" : point ? `${name} pinned on map` : `${name}: type an address`
                  }
                  resetKey={point ? `${point.lon},${point.lat}` : ""}
                  onSelect={(hit) => setRoutePoint(end, { lon: hit.lon, lat: hit.lat })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant={picking ? "default" : "outline"}
                  aria-label={`Pick ${name} on the map`}
                  aria-pressed={picking}
                  className="h-8 w-8 shrink-0"
                  onClick={() => setRoutePicking(picking ? null : end)}
                >
                  <MapPin className={end === "start" ? "h-3.5 w-3.5 text-green-500" : "h-3.5 w-3.5 text-red-500"} />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-2 min-h-[1.25rem] text-[11px] text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : isLoading ? (
            "Finding a walking route…"
          ) : route ? (
            <span className="text-foreground">
              <span className="font-semibold tabular-nums">{formatDistance(route.distanceMeters)}</span> ·
              about <span className="font-semibold tabular-nums">{formatDuration(route.durationSeconds)}</span> on foot
            </span>
          ) : (
            "Type an address or tap the pin to pick on the map."
          )}
        </div>

        {route ? (
          <Button type="button" size="sm" className="mt-2 h-8 w-full text-[11px]" onClick={follow}>
            <Footprints className="h-3.5 w-3.5" />
            {followingRoute ? "Pause walk along route" : "Walk along route"}
          </Button>
        ) : null}

        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Routing by OSRM (foot) on routing.openstreetmap.de · © OpenStreetMap
          contributors. Shared community server — light use only.
        </p>
      </Card>
    </div>
  );
}
