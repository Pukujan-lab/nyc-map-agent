import { useEffect, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LngLat } from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { useMapState } from "@/lib/store/MapStateContext";
import { useNow, useTransitData } from "./hooks";
import { minutesUntil, stationOf, trainProgress, type SystemId } from "./model";
import { setFollowed } from "./follow";
import { ease, followPose, undergroundShare } from "./followCam";
import { useXrayDressing } from "./xrayDressing";
import { setXrayAuto, useViewState } from "@/lib/map/viewMode";

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
  // Underground turns X-ray on by itself; the toggle beside the view chips forces it on everywhere.
  const { xray } = useViewState();
  useEffect(() => { setXrayAuto(u > 0.5); }, [u]);
  useEffect(() => () => setXrayAuto(false), []);
  const shown = xray ? 1 : u;
  useXrayDressing(map, trip?.route, route?.color ?? "#808183", shown > 0.5, shown);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-16 z-20 md:top-3 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border bg-background/95 px-3 py-1.5 text-sm text-foreground shadow-md" data-testid="follow-train">
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
