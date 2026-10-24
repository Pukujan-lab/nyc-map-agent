import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getMapInstance } from "@/lib/map/mapInstance";
import { bindPreviewRelease } from "@/lib/transit/follow";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { along, buildTimeline, calloutInfoAt, poseAt, wallSeconds, type Segment } from "./flythrough";
import { initialPlayback, isActive, playback, type Playback } from "./playback";
import type { PlaybackSpeed, Trip } from "./schema";
import { setMarker, setPreviewDim, setXray } from "./tripLayer";

export type Speed = PlaybackSpeed;
export interface PlayerState extends Playback { active: boolean; playing: boolean; segs: Segment[]; callout: string }

/**
 * Drives the map camera through the trip timeline with requestAnimationFrame.
 * The rules (load, play, select another option, speed) live in ./playback;
 * this hook only draws, and owns exactly one animation frame at a time.
 */
export function usePlayer(onCallout?: (text: string) => void) {
  const reduced = usePrefersReducedMotion();
  const [pb, dispatch] = useReducer(playback, initialPlayback);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [callout, setCallout] = useState("");
  const pbRef = useRef(pb);
  pbRef.current = pb;
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
    setSegs(t);
    setCallout(t[0]?.label ?? "");
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
    setSegs(t);
    setCallout(t[0]?.label ?? "");
    if (pbRef.current.status !== "playing") clearLayers();
    dispatch({ type: "select", tripId: trip.id, segCount: t.length });
  }, [clearLayers]);
  /** Drop the preview camera without easing the map home. Follow and Ask use this. */
  const release = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    clearLayers();
    dispatch({ type: "stop" });
  }, [clearLayers]);
  const stop = useCallback(() => {
    release();
    getMapInstance()?.easeTo({ pitch: 0, zoom: 14, bearing: 0, duration: 600 });
  }, [release]);
  const toggle = useCallback(() => dispatch({ type: "toggle" }), []);
  const setSpeed = useCallback((speed: Speed) => dispatch({ type: "speed", speed }), []);
  const skip = useCallback(() => dispatch({ type: "skip" }), []);

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
      if (styledSeg.current !== s.seg) {
        // getStyle() serialises the whole style: once per leg, never per frame.
        styledSeg.current = s.seg;
        setPreviewDim(map, true);
        setXray(map, seg.underground && seg.kind !== "walk");
      }
      map.jumpTo({ center: pose.center, bearing: pose.bearing, pitch: pose.pitch, zoom: pose.zoom });
      setMarker(map, seg.kind === "ride" ? along(seg.coords, f) : pose.center, seg.route);
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

  const state: PlayerState = { ...pb, active: isActive(pb), playing: pb.status === "playing", segs, callout };
  return { state, load, start, select, stop, release, toggle, setSpeed, skip };
}
