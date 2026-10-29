import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { headingSpread } from "@/lib/compass/heading";
import { useHeading } from "@/lib/compass/useHeading";
import { startSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { simRequested } from "@/lib/geo/simWalk";
import { setYouCamera, useYouCamera, youCamera, YOU_MOVE } from "@/lib/geo/youCamera";
import { onMapInstance } from "@/lib/map/mapInstance";
import { installYouLayer, raiseYouLayer, setYouLayer } from "@/lib/map/youLayer";

type Pt = [number, number];

/** Add the marker's layers if the style takes them now; false while it is still loading. */
function tryInstall(map: MapLibreMap): boolean {
  try {
    installYouLayer(map);
    raiseYouLayer(map);
    return true;
  } catch {
    return false;
  }
}

/** A new fix glides in over this long (or the time since the last fix, if shorter) instead of jumping. */
const GLIDE_MS = 900;
/** Walking guidance draws its own arrow for you; the dot steps aside while it runs. */
const GUIDE_SOURCE = "nav-puck";

/**
 * Your marker, on every screen, whenever your location is shared: one place
 * draws it, and the camera follows it in the mode Center on my location set
 * (see youCamera). `?sim=walk` starts sharing at once with the pretend trip.
 */
export function YouMarker() {
  const shared = useSharedLocation();
  const on = shared.status === "on" && shared.coords !== null;
  const facing = useHeading(on);
  const heading = facing.heading;
  const spread = headingSpread(facing);
  const camera = useYouCamera();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => onMapInstance(setMap), []);

  const shown = useRef<Pt | null>(null);
  const glide = useRef<{ from: Pt; to: Pt; start: number; ms: number } | null>(null);
  const lastFix = useRef(0);
  const raf = useRef(0);
  const easingUntil = useRef(0);
  const foreign = useRef(false);
  const live = useRef({ heading, spread, accuracy: shared.accuracy ?? null, camera });
  live.current = { heading, spread, accuracy: shared.accuracy ?? null, camera };

  // The pretend trip shares and follows on its own: nothing to tap.
  useEffect(() => {
    if (typeof window === "undefined" || !simRequested(window.location.search)) return;
    setYouCamera("follow");
    void startSharing();
  }, []);

  // Draw at the glided position and move the camera with it when following.
  const draw = useRef<(m: MapLibreMap) => void>(() => {});
  draw.current = (m: MapLibreMap) => {
    // The style may not have been ready when the marker mounted; try again with each fix.
    if (!m.getLayer("you-dot") && !tryInstall(m)) return;
    const at = shown.current;
    const guided = Boolean(m.getSource(GUIDE_SOURCE));
    setYouLayer(m, guided ? null : at, live.current.heading, live.current.accuracy, live.current.spread);
    const mode = live.current.camera;
    if (!at || mode === "off" || foreign.current || performance.now() < easingUntil.current) return;
    m.jumpTo({ center: at, ...(mode === "turn" && live.current.heading !== null ? { bearing: live.current.heading } : {}) }, YOU_MOVE);
  };

  // Install the layers, and again after a style reload.
  useEffect(() => {
    if (!map) return;
    let busy = false;
    const install = () => {
      if (busy) return;
      busy = true;
      try {
        // Other features add layers later; keep the marker above them.
        if (map.getLayer("you-dot")) raiseYouLayer(map);
        else if (tryInstall(map)) draw.current(map);
      } finally {
        busy = false;
      }
    };
    install();
    map.on("styledata", install);
    return () => { map.off("styledata", install); };
  }, [map]);

  // A drag always stops following. Another feature's camera move (an answer framing a place, the
  // underground helper turning the map) runs undisturbed; following stops only if it leaves you off screen.
  useEffect(() => {
    if (!map) return;
    const start = (e: unknown) => {
      const ev = e as { youMove?: boolean; originalEvent?: unknown };
      if (ev.youMove || youCamera() === "off") return;
      if (ev.originalEvent) { setYouCamera("off"); return; }
      foreign.current = true;
    };
    const end = (e: unknown) => {
      if ((e as { youMove?: boolean }).youMove || !foreign.current) return;
      foreign.current = false;
      if (youCamera() === "off" || !shown.current) return;
      const p = map.project(shown.current);
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) setYouCamera("off");
    };
    map.on("movestart", start);
    map.on("moveend", end);
    return () => { map.off("movestart", start); map.off("moveend", end); };
  }, [map]);

  // A new fix: glide from where the dot is now.
  const lon = on ? shared.coords!.lon : null;
  const lat = on ? shared.coords!.lat : null;
  useEffect(() => {
    if (!map) return;
    if (lon === null || lat === null) {
      shown.current = null;
      glide.current = null;
      draw.current(map);
      return;
    }
    const to: Pt = [lon, lat];
    const now = performance.now();
    const ms = lastFix.current ? Math.min(GLIDE_MS, now - lastFix.current) : 0;
    lastFix.current = now;
    if (!shown.current || ms <= 0) {
      shown.current = to;
      draw.current(map);
      return;
    }
    glide.current = { from: shown.current, to, start: now, ms };
    const step = () => {
      const g = glide.current;
      if (!g) return;
      const t = Math.min(1, (performance.now() - g.start) / g.ms);
      shown.current = [g.from[0] + (g.to[0] - g.from[0]) * t, g.from[1] + (g.to[1] - g.from[1]) * t];
      draw.current(map);
      raf.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
  }, [map, lon, lat]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // The cone turns, or the circle changes, between fixes.
  useEffect(() => {
    if (map) draw.current(map);
  }, [map, heading, spread, shared.accuracy]);

  // Entering a mode eases there once; after that each frame keeps up.
  useEffect(() => {
    if (!map || camera === "off" || !shown.current) return;
    const turn = camera === "turn" && live.current.heading !== null;
    easingUntil.current = performance.now() + 700;
    map.easeTo({ center: shown.current, zoom: Math.max(map.getZoom(), 16), bearing: turn ? live.current.heading! : 0, duration: 650 }, YOU_MOVE);
  }, [map, camera, on]);

  return null;
}
