import { useSyncExternalStore } from "react";

/**
 * Which camera the view switcher shows ("Map · Elevated · Street") and the
 * X-ray toggle beside it. Street is the walk camera (MapState.walking); this
 * store only adds Elevated, and X-ray's manual and automatic halves:
 * `xray` is the user's toggle, `xrayAuto` is set by the follow-train camera
 * while its train is underground.
 */
export type CameraView = "map" | "elevated" | "street";

/** Elevated: a camera this many metres up… */
export const ELEVATED_HEIGHT_M = 60;
/** …tilted this far from straight down (0 = top-down, 90 = level). */
export const ELEVATED_PITCH = 55;

const METERS_PER_DEGREE = 111_320;

/**
 * Where the Elevated eye stands so that it looks at `center` on the ground:
 * `ELEVATED_HEIGHT_M` up and `height·tan(pitch)` metres behind it along the bearing.
 */
export function elevatedEye(center: { lng: number; lat: number }, bearing: number): { lng: number; lat: number; back: number } {
  const back = ELEVATED_HEIGHT_M * Math.tan((ELEVATED_PITCH * Math.PI) / 180);
  const rad = (bearing * Math.PI) / 180;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return {
    lng: center.lng - (back * Math.sin(rad)) / (METERS_PER_DEGREE * cosLat),
    lat: center.lat - (back * Math.cos(rad)) / METERS_PER_DEGREE,
    back,
  };
}

type State = { elevated: boolean; xray: boolean; xrayAuto: boolean };
let state: State = { elevated: false, xray: false, xrayAuto: false };
const subs = new Set<() => void>();
function set(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (next.elevated === state.elevated && next.xray === state.xray && next.xrayAuto === state.xrayAuto) return;
  state = next;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));

export const setElevated = (on: boolean) => set({ elevated: on });
export const setXray = (on: boolean) => set({ xray: on });
export const setXrayAuto = (on: boolean) => set({ xrayAuto: on });
export const getViewState = () => state;
export function useViewState(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** The chip that is lit: street wins (it is a mode), then elevated, else the map. */
export function activeView(walking: boolean, elevated: boolean): CameraView {
  return walking ? "street" : elevated ? "elevated" : "map";
}
