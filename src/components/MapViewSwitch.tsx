import { useEffect, useState } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { onMapInstance } from "@/lib/map/mapInstance";
import { metresBetween } from "@/lib/map/walk";
import { backToStreet, setStreetSpot, showView, useStreetSpot, type ViewName } from "@/lib/map/viewChange";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePullSheetUp } from "@/lib/store/pullSheet";
import { setFollowMode, useFollowMode, useFollowed, type FollowMode } from "@/lib/transit/follow";
import { useSelectedLine } from "@/lib/transit/selectedLine";

/** Tilted past this, the map counts as 3D. */
const TILTED_DEG = 20;
/** Street from the map goes back to where you stood when the map is still about there. */
const SAME_SPOT_M = 150;

const VIEWS: Array<{ id: ViewName; label: string }> = [
  { id: "map", label: "Map" },
  { id: "3d", label: "3D" },
  { id: "street", label: "Street" },
];

function useMap(): MapLibreMap | null {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => onMapInstance(setMap), []);
  return map;
}

function useTilted(map: MapLibreMap | null): boolean {
  const [tilted, setTilted] = useState(false);
  useEffect(() => {
    if (!map) return;
    const sync = () => setTilted(map.getPitch() > TILTED_DEG);
    sync();
    map.on("pitch", sync);
    return () => { map.off("pitch", sync); };
  }, [map]);
  return tilted;
}

/**
 * Where the switch and "Back to street view" stand. A line panel docked at the top
 * (right side on wider screens, the whole top on a phone) pushes them below its
 * pill and centres them in the map left beside it, clear of the menu row too.
 * `--lp` is the docked panel's width plus its margins.
 */
function usePlace(): { docked: boolean; left: string; cls: string } {
  const line = useSelectedLine();
  const sheet = usePullSheetUp();
  const docked = Boolean(line) && !sheet;
  return {
    docked,
    left: docked ? "max(131px, calc((100% - var(--lp)) / 2))" : "50%",
    cls: "[--lp:392px] md:[--lp:412px] lg:[--lp:432px]",
  };
}

/** Map, 3D or Street for the spot you are looking at, keeping the heading. */
export function pickView(map: MapLibreMap | null, view: ViewName, walking: boolean, spot: ReturnType<typeof useStreetSpot>): void {
  if (!map) return;
  const c = map.getCenter();
  if (view === "street" && !walking && spot && metresBetween([spot.lon, spot.lat], [c.lng, c.lat]) < SAME_SPOT_M) {
    backToStreet();
    return;
  }
  // While walking, MapView stands in for the eye; elsewhere it is the middle of the map.
  showView(view, walking ? null : { lon: c.lng, lat: c.lat }, walking ? null : map.getBearing());
}

/**
 * While following a train the switch moves the follow camera instead: Map is
 * the flat follow, 3D the chase camera, Street the cab (owner, 2026-10-26).
 */
const FOLLOW_FOR: Record<ViewName, FollowMode> = { map: "map", "3d": "chase", street: "cab" };
export function followView(mode: FollowMode): ViewName {
  return mode === "cab" ? "street" : mode === "chase" || mode === "side" ? "3d" : "map";
}

/** Which of Map, 3D and Street is showing. */
export function useCurrentView(): { map: MapLibreMap | null; current: ViewName; walking: boolean; spot: ReturnType<typeof useStreetSpot> } {
  const map = useMap();
  const { walking } = useMapState();
  const tilted = useTilted(map);
  const spot = useStreetSpot();
  return { map, current: walking ? "street" : tilted ? "3d" : "map", walking, spot };
}

/**
 * Map · 3D · Street at the top centre, on wider screens (on a phone the cube
 * button opens the same three). Each keeps the spot and the heading.
 */
export function MapViewSwitch() {
  const { map, current: here, walking, spot } = useCurrentView();
  const following = useFollowed() !== null;
  const mode = useFollowMode();
  const current = following ? followView(mode) : here;
  const place = usePlace();
  return (
    <div role="radiogroup" aria-label="View" data-testid="map-view-switch"
      className={`pointer-events-auto absolute z-40 hidden -translate-x-1/2 gap-0.5 rounded-full border border-[#263449] bg-[rgba(15,23,42,0.92)] p-1 text-[#f1f5f9] shadow-[0_6px_18px_rgba(0,0,0,0.35)] sm:flex ${place.cls}`}
      style={{ top: `calc(env(safe-area-inset-top) + ${place.docked ? 72 : 16}px)`, left: place.left }}>
      {VIEWS.map((v) => {
        const on = current === v.id;
        return (
          <button key={v.id} type="button" role="radio" aria-checked={on} onClick={() => { if (on) return; if (following) setFollowMode(FOLLOW_FOR[v.id]); else pickView(map, v.id, walking, spot); }}
            className="h-9 min-w-[64px] rounded-full px-3 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
            style={{ background: on ? "#f8fafc" : "transparent", color: on ? "#0f172a" : undefined }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * After street view: a "you" marker where you stood, pointing the way you
 * faced, and "Back to street view" to stand there again.
 */
export function BackToStreet() {
  const map = useMap();
  const { walking } = useMapState();
  const spot = useStreetSpot();
  const show = !walking && spot !== null;
  const place = usePlace();

  useEffect(() => {
    if (!map || !show || !spot) return;
    const el = document.createElement("div");
    el.setAttribute("data-testid", "street-spot-marker");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "width:80px;height:80px;pointer-events:none";
    el.innerHTML = `<svg viewBox="0 0 80 80" width="80" height="80"><path d="M40 40 L22 6 A38 38 0 0 1 58 6 Z" fill="#60a5fa" fill-opacity="0.55" stroke="#60a5fa" stroke-width="1.5"/><circle cx="40" cy="40" r="10" fill="#2563eb" stroke="#fff" stroke-width="3"/></svg>`;
    const marker = new Marker({ element: el, rotation: spot.heading, rotationAlignment: "map", pitchAlignment: "map" })
      .setLngLat([spot.lon, spot.lat])
      .addTo(map);
    return () => { marker.remove(); };
  }, [map, show, spot]);

  if (!show) return null;
  return (
    <div data-testid="back-to-street"
      className={`pointer-events-auto absolute left-1/2 top-[calc(env(safe-area-inset-top)+var(--bt))] z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#263449] bg-[rgba(15,23,42,0.92)] p-1 text-[#f1f5f9] shadow-[0_6px_18px_rgba(0,0,0,0.35)] sm:left-[var(--bl)] sm:top-[calc(env(safe-area-inset-top)+var(--bt)+56px)] ${place.cls}`}
      style={{ ["--bl" as string]: place.left, ["--bt" as string]: `${place.docked ? 72 : 16}px` }}>
      <button type="button" onClick={backToStreet}
        className="h-9 whitespace-nowrap rounded-full bg-[#2563eb] px-4 text-[14px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
        Back to street view
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => setStreetSpot(null)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] leading-none text-[#a5b4cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">×</button>
    </div>
  );
}
