import { useCallback, useEffect, useRef, useState } from "react";
import { getMapInstance } from "@/lib/map/mapInstance";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { along, buildTimeline, calloutAt, poseAt, wallSeconds, type Segment } from "./flythrough";
import type { Trip } from "./schema";
import { setMarker, setPreviewDim, setXray } from "./tripLayer";

export type Speed = 2 | 10 | 30;
export interface PlayerState { active: boolean; playing: boolean; speed: Speed; seg: number; segs: Segment[]; callout: string }

/** Drives the map camera through the trip timeline with requestAnimationFrame. */
export function usePlayer(onCallout?: (text: string) => void) {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<PlayerState>({ active: false, playing: false, speed: 10, seg: 0, segs: [], callout: "" });
  const st = useRef(state);
  st.current = state;
  const elapsed = useRef(0);
  /** Speed the elapsed clock was counted at, so a dial change keeps the camera and changes the rate. */
  const playedSpeed = useRef<Speed>(state.speed);
  const lastCallout = useRef("");
  const styledSeg = useRef(-1);
  const say = useRef(onCallout);
  say.current = onCallout;

  const start = useCallback((trip: Trip, speed: Speed) => {
    elapsed.current = 0;
    playedSpeed.current = speed;
    lastCallout.current = "";
    styledSeg.current = -1;
    setState({ active: true, playing: true, speed, seg: 0, segs: buildTimeline(trip), callout: "" });
  }, []);
  const stop = useCallback(() => {
    const map = getMapInstance();
    if (map) { setXray(map, false); setPreviewDim(map, false); setMarker(map, null); map.easeTo({ pitch: 0, zoom: 14, bearing: 0, duration: 600 }); }
    setState((s) => ({ ...s, active: false, playing: false }));
  }, []);
  const toggle = useCallback(() => setState((s) => ({ ...s, playing: !s.playing })), []);
  const setSpeed = useCallback((speed: Speed) => setState((s) => ({ ...s, speed })), []);
  const skip = useCallback(() => {
    elapsed.current = 0;
    setState((s) => (s.seg + 1 >= s.segs.length ? { ...s, playing: false, seg: s.segs.length - 1 } : { ...s, seg: s.seg + 1 }));
  }, []);

  useEffect(() => {
    if (!state.active || !state.playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const s = st.current;
      const seg = s.segs[s.seg];
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
      const text = calloutAt(seg, f);
      if (text !== lastCallout.current) {
        lastCallout.current = text;
        say.current?.(text);
        setState((x) => ({ ...x, callout: text }));
      }
      if (elapsed.current >= total) {
        elapsed.current = 0;
        if (s.seg + 1 >= s.segs.length) { setState((x) => ({ ...x, playing: false })); return; }
        setState((x) => ({ ...x, seg: x.seg + 1 }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.active, state.playing, state.seg, reduced]);

  return { state, start, stop, toggle, setSpeed, skip };
}
