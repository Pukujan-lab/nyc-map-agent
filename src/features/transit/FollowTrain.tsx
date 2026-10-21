import { useEffect, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LngLat, type Map as MaplibreMap } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { useMapState } from "@/lib/store/MapStateContext";
import { useNow, useTransitData } from "./hooks";
import { minutesUntil, stationOf, trainProgress, type SystemId } from "./model";
import { setFollowed } from "./follow";
import { ease, followPose, undergroundShare } from "./followCam";
import { WORLD } from "./focus";

const VEIL = "follow-xray-veil";
const TUNNEL = "follow-xray-tunnel";
const STATIONS = "follow-xray-stations";
/** Building opacity while the followed train is underground (the x-ray look). */
const XRAY_BUILDINGS = 0.12;

/** The theme's foreground colour as an HSL string, so the ground veil follows the theme. */
function themeInk(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
  const [h, s, l] = v.split(/\s+/);
  return h && s && l ? `hsl(${h}, ${s}, ${l})` : "#111827";
}

/** X-ray dressing: veil over the ground, buildings faded, the followed line's tunnel and stations lit. */
function useXrayDressing(map: MaplibreMap | undefined, route: string | undefined, color: string, on: boolean, u: number) {
  const saved = useRef(new Map<string, unknown>());
  useEffect(() => {
    if (!map || !route) return;
    const before = map.getLayer("transit-line-under") ? "transit-line-under" : undefined;
    if (!map.getSource(VEIL)) map.addSource(VEIL, { type: "geojson", data: WORLD });
    if (!map.getLayer(VEIL)) map.addLayer({ id: VEIL, type: "fill", source: VEIL, paint: { "fill-color": themeInk(), "fill-opacity": 0, "fill-opacity-transition": { duration: 0 } } }, before);
    if (map.getSource("transit-lines") && !map.getLayer(TUNNEL))
      map.addLayer({ id: TUNNEL, type: "line", source: "transit-lines", filter: ["all", ["==", ["get", "route"], route], ["==", ["get", "grade"], "underground"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 7, "line-opacity": 0 } });
    if (map.getSource("transit-stations") && !map.getLayer(STATIONS))
      map.addLayer({ id: STATIONS, type: "circle", source: "transit-stations", filter: ["in", route, ["to-string", ["get", "routes"]]], paint: { "circle-radius": 9, "circle-color": "#ffffff", "circle-stroke-color": color, "circle-stroke-width": 3, "circle-opacity": 0, "circle-stroke-opacity": 0 } });
    return () => {
      for (const id of [STATIONS, TUNNEL, VEIL]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(VEIL)) map.removeSource(VEIL);
    };
  }, [map, route, color]);
  // Continuous parts follow the blend every frame-ish.
  useEffect(() => {
    if (!map) return;
    if (map.getLayer(VEIL)) map.setPaintProperty(VEIL, "fill-opacity", 0.62 * u);
    if (map.getLayer(TUNNEL)) map.setPaintProperty(TUNNEL, "line-opacity", u);
    if (map.getLayer(STATIONS)) { map.setPaintProperty(STATIONS, "circle-opacity", u); map.setPaintProperty(STATIONS, "circle-stroke-opacity", u); }
  }, [map, u]);
  // Buildings fade with MapLibre's own paint transition, not a pop.
  useEffect(() => {
    if (!map) return;
    const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && !l.id.startsWith("transit-")).map((l) => l.id);
    for (const id of ids) {
      map.setPaintProperty(id, "fill-extrusion-opacity-transition", { duration: 900, delay: 0 });
      if (on) {
        if (!saved.current.has(id)) saved.current.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
        map.setPaintProperty(id, "fill-extrusion-opacity", XRAY_BUILDINGS);
      } else if (saved.current.has(id)) {
        map.setPaintProperty(id, "fill-extrusion-opacity", saved.current.get(id));
        saved.current.delete(id);
      }
    }
  }, [map, on]);
  useEffect(() => () => {
    if (!map) return;
    for (const [id, v] of saved.current) if (map.getLayer(id)) map.setPaintProperty(id, "fill-extrusion-opacity", v);
    saved.current.clear();
  }, [map]);
}

/**
 * Follow-train camera. Rides the train's route shape: just behind and above
 * it at track height on elevated and at-grade runs, and an x-ray view (ground
 * veiled, buildings faded, tunnel and stations lit) underground, blended
 * across portals. Positions come from the trip's predicted stop times along
 * the shape, re-evaluated every frame and eased, so feed updates never snap.
 */
export default function FollowTrain({ vehicleKey }: { vehicleKey: string }) {
  const { current } = useMap();
  const map = current?.getMap();
  const { walking, stopWalk } = useMapState();
  const [system, ...rest] = vehicleKey.split(":");
  const tripId = rest.join(":");
  const rail = system === "subway" || system === "lirr" || system === "mnr" ? [system as SystemId] : [];
  const data = useTransitData(rail)[system as SystemId];
  const now = useNow();
  const src = useRef(data);
  src.current = data;
  const [u, setU] = useState(0);

  useEffect(() => { if (walking) stopWalk(); }, [walking, stopWalk]);

  useEffect(() => {
    if (!map) return;
    const maxPitch = map.getMaxPitch();
    map.setMaxPitch(Math.max(maxPitch, 89));
    let raf = 0, last = performance.now(), mShown = NaN, uShown = NaN, uSent = -1;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      const st = src.current?.stat, trip = src.current?.live?.trips.find((x) => x.id === tripId);
      if (!st || !trip) return;
      const p = trainProgress(st, trip, Date.now() / 1000);
      if (!p) return;
      mShown = ease(mShown, p.m, dt, 1.5, 3000);
      uShown = ease(uShown, undergroundShare(st, trip.route, mShown), dt, 0.8);
      const pose = followPose(st, trip.route, mShown, p.forward, uShown);
      if (!pose) return;
      map.jumpTo(map.calculateCameraOptionsFromTo(new LngLat(...pose.eye), pose.eyeAlt, new LngLat(...pose.look), pose.lookAlt));
      if (Math.abs(uShown - uSent) > 0.02) { uSent = uShown; setU(uShown); }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); map.setMaxPitch(maxPitch); };
  }, [map, tripId]);

  const trip = data?.live?.trips.find((x) => x.id === tripId);
  const route = trip ? data?.stat?.routes[trip.route] : undefined;
  const prog = data?.stat && trip ? trainProgress(data.stat, trip, now) : null;
  const station = prog && data?.stat ? data.stat.stations.features.find((f) => String(f.properties.id) === stationOf(system as SystemId, prog.next.id))?.properties.name : undefined;
  useXrayDressing(map, trip?.route, route?.color ?? "#808183", u > 0.5, u);

  return (
    <div className="pointer-events-auto absolute left-1/2 bottom-28 z-20 md:bottom-auto md:top-3 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-3 py-1.5 text-sm text-foreground shadow-md" data-testid="follow-train">
      {route ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: route.color, color: route.text ? `#${route.text.replace("#", "")}` : "#fff" }}>{route.short}</span>
      ) : null}
      <span className="min-w-0 truncate">
        {station ? <>Next <span className="font-medium">{station}</span>{prog ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(prog.next.t, now)} min</span> : null}</> : "Train left the live feed"}
        {u > 0.5 ? <span className="text-muted-foreground"> · underground</span> : null}
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0 rounded-full" onClick={() => setFollowed(null)}>Stop following</Button>
    </div>
  );
}
