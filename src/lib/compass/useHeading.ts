import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { bearing, metres, type Pt } from "@/lib/map/mapRead";
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
  useEffect(() => {
    const c = shared.status === "on" ? shared.coords : null;
    if (!on || !c) { if (!on) anchor.current = null; return; }
    const here: Pt = [c.lon, c.lat];
    // The phone's own direction of travel, when it gives one, needs no second fix.
    if (shared.course != null && (shared.speed ?? 0) >= COURSE_MIN_SPEED) {
      dispatch({ type: "move", heading: shared.course });
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
