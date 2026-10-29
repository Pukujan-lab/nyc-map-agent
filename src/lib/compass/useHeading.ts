import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { bearing, metres, type Pt } from "@/lib/map/mapRead";
import { loadStairs, surfacedFacing, WEAK_M, type Fix, type Stair } from "./surfacing";
import { accuracyFromEvent, headingFromEvent, headingReducer, initialHeading, MOVE_MIN_M, type HeadingState, type OrientationLike } from "./heading";

type IosOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

// iOS asks once per page from a tap; every screen that shows your direction shares the answer.
let iosAllowed = false;
const allowListeners = new Set<() => void>();
function setIosAllowed(v: boolean) {
  iosAllowed = v;
  allowListeners.forEach((l) => l());
}
const subscribeAllowed = (l: () => void) => { allowListeners.add(l); return () => { allowListeners.delete(l); }; };

/** Below this speed (m/s) a phone's reported direction of travel is noise. */
const COURSE_MIN_SPEED = 0.5;
/** Faster than a brisk walk (m/s) and you are on a train or a bike: the phone may point anywhere. */
const WALK_MAX_SPEED = 3;

export interface Heading extends HeadingState {
  /** iOS: the compass waits for a tap on this (Safari only asks from a tap). */
  ask: (() => void) | null;
}

/**
 * The phone's heading while `on`: the compass where there is one (iOS asks
 * permission on a tap), else the direction you walk. Readings stay in memory.
 */
export function useHeading(on: boolean): Heading {
  const [s, dispatch] = useReducer(headingReducer, initialHeading);
  const ios = typeof DeviceOrientationEvent !== "undefined" && typeof (DeviceOrientationEvent as IosOrientation).requestPermission === "function";
  const iosOk = useSyncExternalStore(subscribeAllowed, () => iosAllowed, () => iosAllowed);
  const allowed = !ios || iosOk;

  useEffect(() => {
    if (!on) dispatch({ type: "reset" });
    if (!on || !allowed || typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return;
    const onEvent = (e: Event) => {
      const o = e as unknown as OrientationLike;
      const h = headingFromEvent(o);
      if (h !== null) dispatch({ type: "compass", heading: h, accuracyDeg: accuracyFromEvent(o) });
    };
    // Android gives an absolute heading only on deviceorientationabsolute; iOS on deviceorientation.
    const name = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(name, onEvent);
    return () => window.removeEventListener(name, onEvent);
  }, [on, allowed]);

  // Walking heading: the bearing from the last anchor fix once you have moved MOVE_MIN_M.
  const shared = useSharedLocation();
  const anchor = useRef<Pt | null>(null);
  const recent = useRef<Fix[]>([]);
  const stairs = useRef<Stair[]>([]);
  useEffect(() => {
    const c = shared.status === "on" ? shared.coords : null;
    if (!on || !c) { if (!on) anchor.current = null; return; }
    const here: Pt = [c.lon, c.lat];
    // Just came up a subway stair: its way up is the way you face.
    const fix = { t: Date.now(), at: here, accuracy: shared.accuracy ?? null };
    recent.current = [...recent.current.filter((f) => fix.t - f.t <= 120_000), fix];
    if ((fix.accuracy ?? 0) >= WEAK_M) void loadStairs().then((list) => { stairs.current = list; });
    const up = stairs.current.length ? surfacedFacing(recent.current, stairs.current) : null;
    if (up !== null) dispatch({ type: "stair", heading: up });
    // The phone's own direction of travel, when it gives one, needs no second fix.
    if (shared.course != null && (shared.speed ?? 0) >= COURSE_MIN_SPEED) {
      // Only walking with a sharp fix teaches the street lock; a train ride does not.
      const learn = (shared.accuracy ?? 0) <= 30 && (shared.speed ?? 0) <= WALK_MAX_SPEED;
      dispatch({ type: "move", heading: shared.course, learn });
      anchor.current = here;
      return;
    }
    if ((shared.accuracy ?? 0) > 30) return;
    if (!anchor.current) { anchor.current = here; return; }
    if (metres(anchor.current, here) < MOVE_MIN_M) return;
    dispatch({ type: "move", heading: bearing(anchor.current, here) });
    anchor.current = here;
  }, [on, shared]);

  const ask = useCallback(() => {
    const req = (DeviceOrientationEvent as IosOrientation).requestPermission;
    void req?.().then((r) => setIosAllowed(r === "granted")).catch(() => setIosAllowed(false));
  }, []);

  return { ...s, ask: on && ios && !allowed ? ask : null };
}
