import "./nav.css";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Navigation, Square, Undo2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { onMapInstance } from "@/lib/map/mapInstance";
import { LOOK_CENTER_DISTANCE_M, poseAlongRoute } from "@/lib/map/walk";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { installNavLayers, readNavColors, removeNavLayers, roadNameAt, updateNavLayers } from "./layers";
import { distanceAlong, fetchGuidedRoute, formatMetres, metresLeft, progressAt, type RouteStep } from "./steps";

const MILE = 1609.344;

function TurnIcon({ step }: { step: RouteStep | null }) {
  const cls = "h-7 w-7 shrink-0 text-primary";
  if (!step) return <ArrowUp className={cls} />;
  if (step.type === "arrive") return <Flag className={cls} />;
  const m = step.modifier ?? "";
  if (m === "uturn") return <Undo2 className={cls} />;
  if (m.includes("left")) return <CornerUpLeft className={cls} />;
  if (m.includes("right")) return <CornerUpRight className={cls} />;
  return <ArrowUp className={cls} />;
}

interface Fix {
  lon: number;
  lat: number;
  accuracy: number;
  heading: number | null;
}

/**
 * Navigation guidance for the walking route: glowing route with chevrons and a
 * turn arrow, a compact next-turn card, and a street-name pill. In street
 * view it follows the camera; in 2D, "Navigate" follows your location
 * heading-up and tilted. Location is asked for only when you tap Navigate,
 * stays in this tab, and is never sent to our API.
 */
export default function RouteGuide() {
  const { routeStart, routeEnd } = useDataView();
  const { walking } = useMapState();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [pos, setPos] = useState<{ lon: number; lat: number; bearing: number } | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [centered, setCentered] = useState(true);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => onMapInstance(setMap), []);

  const { data: route } = useQuery({
    queryKey: ["walk-steps", routeStart?.lon, routeStart?.lat, routeEnd?.lon, routeEnd?.lat],
    enabled: routeStart !== null && routeEnd !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: ({ signal }) => fetchGuidedRoute(routeStart!, routeEnd!, signal),
  });

  const active = Boolean(route) && (walking || navigating);

  // Layers live while guidance is active; re-added after a style reload and on theme change.
  useEffect(() => {
    if (!map || !active) return;
    let busy = false;
    const install = () => {
      // Only when missing, and never re-entrantly: installing fires styledata itself.
      if (busy || map.getSource("nav-puck") || !map.isStyleLoaded()) return;
      busy = true;
      try {
        installNavLayers(map, readNavColors());
      } finally {
        busy = false;
      }
    };
    install();
    map.on("styledata", install);
    const obs = new MutationObserver(() => {
      removeNavLayers(map);
      install();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      map.off("styledata", install);
      obs.disconnect();
      removeNavLayers(map);
    };
  }, [map, active]);

  // Street view: the camera is the walker.
  useEffect(() => {
    if (!map || !walking || !route) return;
    const read = () => {
      // The street camera looks at a point LOOK_CENTER_DISTANCE_M ahead; step back to the eye.
      const c = map.getCenter();
      const b = (map.getBearing() * Math.PI) / 180;
      const back = LOOK_CENTER_DISTANCE_M / 111_320;
      setPos({
        lon: c.lng - (Math.sin(b) * back) / Math.cos((c.lat * Math.PI) / 180),
        lat: c.lat - Math.cos(b) * back,
        bearing: map.getBearing(),
      });
    };
    read();
    map.on("move", read);
    return () => {
      map.off("move", read);
    };
  }, [map, walking, route]);

  // 2D navigation: geolocation only after the tap, cleared on stop and unmount.
  const stopNav = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setNavigating(false);
    setFix(null);
  };
  const startNav = () => {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser has no location access.");
      return;
    }
    setGeoError(null);
    setNavigating(true);
    setCentered(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) =>
        setFix({
          lon: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.speed && p.coords.speed > 0.5 ? p.coords.heading : null,
        }),
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? "Location permission was declined." : "Location is unavailable."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
  };
  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);
  useEffect(() => {
    if (!routeStart || !routeEnd) stopNav();
  }, [routeStart, routeEnd]);

  const here = walking ? pos : fix;
  const along = route && here ? distanceAlong(route.coordinates, here) : 0;
  const routeBearing = route ? poseAlongRoute(route.coordinates, along + 1)?.bearing ?? 0 : 0;
  const heading = walking ? pos?.bearing ?? 0 : fix?.heading ?? routeBearing;
  const progress = route && here ? progressAt(route, here) : null;
  const stepStreet = progress && route ? route.steps[progress.nextIndex - 1]?.name ?? "" : "";
  // In street view the eye is below the screen; probe a little ahead along the heading.
  const probe = here && walking ? poseAlongRoute(route?.coordinates ?? [], along + 15) : here;
  const street = stepStreet || (map && active && probe ? roadNameAt(map, probe.lon, probe.lat) : "");

  // Draw the frame.
  useEffect(() => {
    if (!map || !active || !route || !map.getSource("nav-route")) return;
    updateNavLayers(map, {
      route,
      along,
      next: progress?.next ?? null,
      puck: here
        ? { lon: here.lon, lat: here.lat, bearing: heading, accuracyM: fix?.accuracy ?? 0, show: !walking }
        : null,
    });
  });

  // Heading-up, tilted camera that follows the fix until you pan away.
  useEffect(() => {
    if (!map || !navigating || walking) return;
    const off = () => setCentered(false);
    map.on("dragstart", off);
    return () => {
      map.off("dragstart", off);
    };
  }, [map, navigating, walking]);
  useEffect(() => {
    if (!map || !navigating || walking || !fix || !centered) return;
    map.easeTo({ center: [fix.lon, fix.lat], bearing: heading, pitch: 55, zoom: Math.max(map.getZoom(), 17), duration: 600 });
  }, [map, navigating, walking, fix, centered, heading]);

  if (!route) return null;

  const left = here ? metresLeft(route, here) : route.steps.reduce((s, x) => s + x.distance, 0);

  return (
    <>
      {active && progress ? (
        <div className={`pointer-events-none absolute left-1/2 z-30 w-[min(20rem,calc(100%-1.5rem))] -translate-x-1/2 ${walking ? "bottom-[16rem] sm:bottom-24" : "bottom-40"}`}>
          <div className="flex items-center gap-3 rounded-lg border bg-background/90 p-3 shadow-lg backdrop-blur" role="status">
            <TurnIcon step={progress.next} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {progress.instruction}, {formatMetres(progress.metresToNext)}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">{(left / MILE).toFixed(2)} mi to go</div>
            </div>
          </div>
        </div>
      ) : null}

      {active && street && walking ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[4.5rem] z-30 flex justify-center">
          <span className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow">
            {street}
          </span>
        </div>
      ) : null}

      {!walking ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-2 [&>*]:pointer-events-auto">
          {navigating && !centered ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => setCentered(true)}>
              <LocateFixed className="h-4 w-4" /> Recenter
            </Button>
          ) : null}
          <Button type="button" size="sm" variant={navigating ? "outline" : "default"} onClick={navigating ? stopNav : startNav}>
            {navigating ? <Square className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
            {navigating ? "Stop navigation" : "Navigate"}
          </Button>
          {navigating && fix ? (
            <span className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
              Location accuracy: about {Math.round(fix.accuracy)} m
            </span>
          ) : null}
          {geoError ? <span className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-destructive">{geoError}</span> : null}
        </div>
      ) : null}
    </>
  );
}
