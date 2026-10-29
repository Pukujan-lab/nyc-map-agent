import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { LngLat, type Map as MapLibreMap } from "maplibre-gl";
import { getMapInstance } from "@/lib/map/mapInstance";
import { keepInView } from "@/lib/map/keepInView";
import { framePadding } from "@/lib/map/mapCover";
import { ZoomKeeper, bindPreviewRelease, followMode, followRig, setFollowMode, setPreviewing, stableHeading, type FollowMode } from "@/lib/transit/follow";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { readMap } from "@/lib/map/mapRead";
import { along, buildTimeline, calloutInfoAt, poseAt, wallSeconds, type Segment } from "./flythrough";
import { initialPlayback, isActive, playback, type Playback } from "./playback";
import type { PlaybackSpeed, Trip } from "./schema";
import { setMarker, setPreviewDim, setXray } from "./tripLayer";
import { walkLine, walkPlace } from "./walkPlace";

export type Speed = PlaybackSpeed;
export interface PlayerState extends Playback {
  active: boolean; playing: boolean; segs: Segment[]; callout: string;
  /** "On Queens Blvd · near Aldi" while a walk plays, or where you end up once the trip ends. */
  where: string | null;
}

/** How often a walk re-reads the street and storefronts under the marker. */
const PLACE_MS = 600;
/** How often it re-reads the map's loaded tiles, which change as the camera moves. */
const TILES_MS = 2500;

/**
 * Drives the map camera through the trip timeline with requestAnimationFrame.
 * The rules (load, play, select another option, speed) live in ./playback;
 * this hook only draws, and owns exactly one animation frame at a time.
 */
/** Fit one leg of the trip in the clear map area, flat and north up. */
function frameLeg(map: MapLibreMap, coords: Array<[number, number]>, reduced: boolean) {
  if (!coords.length) return;
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], {
    padding: framePadding(map, { top: 60, bottom: 60, left: 48, right: 48 }),
    maxZoom: 17, pitch: 0, bearing: 0, duration: reduced ? 0 : 800,
  });
}

/** Underground legs ride at the X-ray track depth, as followed trains do. */
const UNDERGROUND_M = -12;

/**
 * Ride the marker with a follow camera (Chase, Side, Overhead, Street), the same
 * rig a followed train uses (src/lib/transit/follow.ts). Your own zoom stays on top.
 */
function rideAlong(map: MapLibreMap, mode: FollowMode, at: [number, number], bearing: number, z: number, zoom: ZoomKeeper) {
  const { eye, look } = followRig(mode, bearing, z);
  const k = 111_320 * Math.cos((at[1] * Math.PI) / 180);
  const pt = (dx: number, dy: number) => new LngLat(at[0] + dx / k, at[1] + dy / 111_320);
  const cam = map.calculateCameraOptionsFromTo(pt(eye[0], eye[1]), eye[2], pt(look[0], look[1]), look[2]);
  map.jumpTo(cam.zoom === undefined ? cam : { ...cam, zoom: zoom.next(cam.zoom, map.getZoom()) });
}

export function usePlayer(onCallout?: (text: string) => void) {
  const reduced = usePrefersReducedMotion();
  const [pb, dispatch] = useReducer(playback, initialPlayback);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [callout, setCallout] = useState("");
  const [where, setWhere] = useState<string | null>(null);
  /** The map read and when it, and the place, were last taken. */
  const place = useRef<{ read: ReturnType<typeof readMap> | null; readAt: number; at: number }>({ read: null, readAt: 0, at: 0 });
  const pbRef = useRef(pb);
  pbRef.current = pb;
  /** The destination's name ("Aldi"), left out of what to look for around it. */
  const dest = useRef("");
  const segsRef = useRef(segs);
  segsRef.current = segs;
  /** Seconds into the current leg, and the speed they were counted at. */
  const elapsed = useRef(0);
  const playedSpeed = useRef<Speed>(pb.speed);
  /** Which restart and leg `elapsed` belongs to; a new one starts the leg at 0. */
  const counted = useRef({ restart: -1, seg: -1 });
  const lastCallout = useRef("");
  const styledSeg = useRef(-1);
  const say = useRef(onCallout);
  say.current = onCallout;
  const rafId = useRef(0);
  /** The follow camera last drawn, and the steadied heading and zoom it rides with. */
  const camMode = useRef<FollowMode>("map");
  const heading = useRef<{ bearing: number; streak: number } | null>(null);
  const zoomKeep = useRef(new ZoomKeeper());

  const clearLayers = useCallback(() => {
    const map = getMapInstance();
    if (!map) return;
    setXray(map, false);
    setPreviewDim(map, false);
    setMarker(map, null);
  }, []);

  /** Put a trip in the player, paused at its start. Nothing moves until play(). */
  const load = useCallback((trip: Trip, speed?: Speed) => {
    const t = buildTimeline(trip);
    dest.current = trip.destination.label.split(",")[0].trim();
    setSegs(t);
    setCallout(t[0]?.label ?? "");
    setWhere(null);
    // A new preview starts on the calm map; a view picked during it then stays until it ends.
    setFollowMode("map");
    dispatch({ type: "load", tripId: trip.id, segCount: t.length, speed });
  }, []);
  /** Load and play at once, for the Play button. */
  const start = useCallback((trip: Trip, speed?: Speed) => {
    if (pbRef.current.tripId !== trip.id || !isActive(pbRef.current)) load(trip, speed);
    else if (speed) dispatch({ type: "speed", speed });
    dispatch({ type: "play" });
  }, [load]);
  /** Another option chosen: keep playing (or stay paused) on the new route, from its start. */
  const select = useCallback((trip: Trip) => {
    if (!isActive(pbRef.current) || pbRef.current.tripId === trip.id) return;
    const t = buildTimeline(trip);
    dest.current = trip.destination.label.split(",")[0].trim();
    setSegs(t);
    setCallout(t[0]?.label ?? "");
    setWhere(null);
    if (pbRef.current.status !== "playing") clearLayers();
    dispatch({ type: "select", tripId: trip.id, segCount: t.length });
  }, [clearLayers]);
  /** Drop the preview camera without easing the map home. Follow and Ask use this. */
  const release = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    clearLayers();
    setWhere(null);
    dispatch({ type: "stop" });
  }, [clearLayers]);
  const stop = useCallback(() => {
    // Only a preview moved the camera. Every new question calls this, and easing home without one
    // threw street view overhead under the street bar, entrance labels piled up (owner report, 2026-10-28).
    const playing = isActive(pbRef.current);
    release();
    if (playing) getMapInstance()?.easeTo({ pitch: 0, zoom: 14, bearing: 0, duration: 600 });
  }, [release]);
  const toggle = useCallback(() => dispatch({ type: "toggle" }), []);
  const setSpeed = useCallback((speed: Speed) => dispatch({ type: "speed", speed }), []);
  const skip = useCallback(() => dispatch({ type: "skip" }), []);

  const on = isActive(pb);
  useEffect(() => { setPreviewing(on); }, [on]);
  useEffect(() => () => setPreviewing(false), []);

  useEffect(() => {
    bindPreviewRelease(release);
    return () => bindPreviewRelease(null);
  }, [release]);

  // One loop per (run, leg) while playing. Every exit path cancels its frame,
  // so a new trip or speed never leaves an old loop drawing over the new one.
  useEffect(() => {
    if (pb.status !== "playing") return;
    let alive = true;
    const s0 = pbRef.current;
    if (counted.current.restart !== s0.restart || counted.current.seg !== s0.seg) {
      // A new leg starts at 0; a restart also re-styles the map and repeats the first callout.
      elapsed.current = 0;
      if (counted.current.restart !== s0.restart) {
        lastCallout.current = "";
        styledSeg.current = -1;
      }
      counted.current = { restart: s0.restart, seg: s0.seg };
    }
    let prev = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      const s = pbRef.current;
      const seg = segsRef.current[s.seg];
      const map = getMapInstance();
      if (!seg || !map) return;
      if (playedSpeed.current !== s.speed) {
        // Keep the camera where it is and change how fast the rest of the leg plays.
        if (!reduced) {
          const prevTotal = wallSeconds(seg, playedSpeed.current);
          const nextTotal = wallSeconds(seg, s.speed);
          elapsed.current = prevTotal > 0 ? elapsed.current * (nextTotal / prevTotal) : 0;
        }
        playedSpeed.current = s.speed;
      }
      elapsed.current += (now - prev) / 1000;
      prev = now;
      const total = reduced ? 3 : wallSeconds(seg, s.speed);
      const f = reduced ? 1 : Math.min(1, elapsed.current / total);
      const pose = poseAt(seg, f);
      const mark = seg.kind === "ride" ? along(seg.coords, f) : pose.center;
      const mode = followMode();
      const newLeg = styledSeg.current !== s.seg;
      if (newLeg) {
        // getStyle() serialises the whole style: once per leg, never per frame.
        styledSeg.current = s.seg;
        setPreviewDim(map, true);
        setXray(map, seg.underground && seg.kind !== "walk");
      }
      if (mode !== "map") {
        // A view picked from Change view: the camera rides the marker, leg after leg, until you pick Map.
        if (camMode.current !== mode) { heading.current = null; zoomKeep.current.reset(); }
        heading.current = stableHeading(heading.current?.bearing ?? null, pose.bearing, heading.current?.streak ?? 0);
        rideAlong(map, mode, mark, heading.current.bearing, seg.underground && seg.kind !== "walk" ? UNDERGROUND_M : 0, zoomKeep.current);
      } else if (newLeg || camMode.current !== "map") {
        // Each leg is framed once, top-down and north up, clear of the open panels.
        frameLeg(map, seg.coords, reduced);
      } else {
        // Then the map stays still while the marker moves, and glides only when it nears the edge.
        keepInView(map, mark);
      }
      camMode.current = mode;
      setMarker(map, mark, seg.route);
      if (seg.kind === "walk" && !seg.underground && now - place.current.at >= PLACE_MS) {
        place.current.at = now;
        if (!place.current.read || now - place.current.readAt >= TILES_MS) place.current = { read: readMap(map, { pois: true }), readAt: now, at: now };
        const line = walkLine(walkPlace(place.current.read!.placeAt(pose.center), pose.center, dest.current));
        setWhere((w) => (line ?? w));
      } else if (seg.kind !== "walk" && place.current.at !== -1) {
        // Off the street (riding, driving, underground): nothing to read until the next walk.
        place.current = { read: null, readAt: 0, at: -1 };
        setWhere(null);
      }
      const { text, quiet } = calloutInfoAt(seg, f);
      if (text !== lastCallout.current) {
        lastCallout.current = text;
        if (!quiet) say.current?.(text);
        setCallout(text);
      }
      if (elapsed.current >= total) {
        alive = false;
        dispatch({ type: "legDone" });
        return;
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [pb.status, pb.seg, pb.run, reduced]);

  // Where the trip ended: the street and what to look for at the destination.
  useEffect(() => {
    if (pb.status !== "ended") return;
    const end = segsRef.current.at(-1)?.coords.at(-1);
    const map = getMapInstance();
    place.current = { read: null, readAt: 0, at: 0 };
    if (end && map) setWhere(walkLine(walkPlace(readMap(map, { pois: true }).placeAt(end), end, dest.current)));
  }, [pb.status]);

  const state: PlayerState = { ...pb, active: isActive(pb), playing: pb.status === "playing", segs, callout, where };
  return { state, load, start, select, stop, release, toggle, setSpeed, skip };
}
