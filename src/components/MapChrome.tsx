import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useFlag } from "@/lib/flags";
import { sharedCoords, startSharing } from "@/lib/geo/sharedLocation";
import { onMapInstance } from "@/lib/map/mapInstance";
import { useMapState } from "@/lib/store/MapStateContext";
import { setOpenMenu, useOpenMenu } from "@/lib/store/openMenu";
import { setFollowMode, stopFollowing, useFollowMode, useFollowed, type FollowMode } from "@/lib/transit/follow";
import { useSelectedLine } from "@/lib/transit/selectedLine";
import { MID_HEIGHT_M, levelOf, type ViewLevel } from "./ViewSwitcher";

/**
 * Aerial on the home's Change view: clearly higher and wider than Closer.
 * The classic Up level (300 m) comes out nearly straight down and only a
 * little above Closer, so Aerial stands the camera ~1.1 km up at a 45° tilt.
 */
const AERIAL_HEIGHT_M = 1100;
const AERIAL_PITCH = 45;

/**
 * Agent-first map chrome (#370, #372): the round buttons at the top right
 * (Change view, Center on my location), the view menu, and a compass that
 * shows only while the map is rotated or tilted. Layers and every other menu
 * live in the top-left menu row (MenuRow).
 */

const ROUND = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 shadow-[0_6px_18px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const DARK = "border border-[#263449] bg-[rgba(15,23,42,0.92)] text-[#f1f5f9]";
const LIGHT = "border border-transparent bg-[#f8fafc] text-[#0f172a]";
const FLOAT = "rounded-[20px] border border-[#263449] bg-[rgba(11,18,32,0.82)] p-2 text-[#f1f5f9] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-[14px]";

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ViewIcon = () => <svg {...svg} width={20} height={20}><path d="M12 3 3 8v8l9 5 9-5V8l-9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>;
// The "my location" crosshair people know from Google Maps (Material Icons, Apache-2.0).
const LocateIcon = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>;
const VIEWS: Array<{ id: ViewLevel; label: string; note: string; icon: ReactNode }> = [
  { id: "top", label: "Top", note: "Flat map", icon: <svg {...svg}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></svg> },
  { id: "up", label: "Aerial", note: "Tilted, from above", icon: <svg {...svg}><path d="M3 17l9-12 9 12H3Z" /></svg> },
  { id: "mid", label: "Closer", note: "Low angle, buildings", icon: <svg {...svg}><path d="M3 20h18M6 20V10l6-5 6 5v10" /></svg> },
  { id: "street", label: "Street", note: "Walk at street level", icon: <svg {...svg}><circle cx="12" cy="5" r="2" /><path d="M12 7v7M9 21l3-7 3 7M8 11h8" /></svg> },
];

/** The live map and its bearing and pitch, outside the react-map-gl tree. */
function useCamera(): { map: MapLibreMap | null; bearing: number; pitch: number } {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [cam, setCam] = useState({ bearing: 0, pitch: 0 });
  useEffect(() => onMapInstance(setMap), []);
  useEffect(() => {
    if (!map) return;
    const sync = () => setCam({ bearing: map.getBearing(), pitch: map.getPitch() });
    sync();
    map.on("rotate", sync);
    map.on("pitch", sync);
    return () => { map.off("rotate", sync); map.off("pitch", sync); };
  }, [map]);
  return { map, ...cam };
}

/** Top / Aerial / Closer / Street: the app's camera levels, as a menu of radio items. */
function ViewMenu({ pitch, onPick }: { pitch: number; onPick: () => void }) {
  const street = useFlag("streetLevel");
  const { walking, startWalk, navigate, setCameraHeight, cameraHeightM } = useMapState();
  const level = levelOf(walking, cameraHeightM, pitch);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus(); }, []);
  const go = (l: ViewLevel) => {
    if (l === "street") { if (!walking) startWalk(); }
    else if (l === "mid") setCameraHeight(MID_HEIGHT_M);
    else if (l === "up") setCameraHeight(AERIAL_HEIGHT_M, AERIAL_PITCH);
    else navigate("north");
    onPick();
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return (
    <div ref={ref} role="menu" tabIndex={-1} aria-label="Change view" data-testid="view-menu" data-map-cover onKeyDown={onKey} className={`flex w-[220px] flex-col gap-0.5 ${FLOAT}`}>
      {VIEWS.filter((v) => street || v.id !== "street").map((v) => {
        const on = level === v.id;
        return (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => go(v.id)}
            className="flex min-h-[52px] items-center gap-3 rounded-[14px] border px-2.5 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
            style={{ background: on ? "rgba(37,99,235,0.22)" : "transparent", borderColor: on ? "rgba(96,165,250,0.55)" : "transparent" }}>
            {v.icon}
            <span className="flex flex-1 flex-col"><span className="font-semibold">{v.label}</span><span className="text-[12px] text-[#a5b4cb]">{v.note}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/** While following, Change view picks the follow camera; Street rides along at street level (trains and buses). */
const FOLLOW_VIEWS: Array<{ id: FollowMode; label: string; note: string }> = [
  { id: "map", label: "Map", note: "Flat, from above" },
  { id: "chase", label: "Chase", note: "Just behind it" },
  { id: "side", label: "Side", note: "Alongside" },
  { id: "overhead", label: "Overhead", note: "High above" },
  { id: "cab", label: "Street", note: "Ride along at street level" },
];

function FollowViewMenu({ onPick }: { onPick: () => void }) {
  const mode = useFollowMode();
  return (
    <div role="menu" aria-label="Change view" data-testid="follow-view-menu" data-map-cover className={`flex w-[220px] flex-col gap-0.5 ${FLOAT}`}>
      {FOLLOW_VIEWS.map((v) => {
        const on = mode === v.id;
        return (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => { setFollowMode(v.id); onPick(); }}
            className="flex min-h-[48px] items-center rounded-[14px] border px-2.5 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
            style={{ background: on ? "rgba(37,99,235,0.22)" : "transparent", borderColor: on ? "rgba(96,165,250,0.55)" : "transparent" }}>
            <span className="flex flex-1 flex-col"><span className="font-semibold">{v.label}</span><span className="text-[12px] text-[#a5b4cb]">{v.note}</span></span>
          </button>
        );
      })}
      <div className="mx-2 my-1 h-px bg-[#263449]" />
      <button type="button" onClick={() => { stopFollowing(); onPick(); }} className="flex min-h-[44px] items-center rounded-[14px] px-2.5 text-left text-[14px] font-semibold text-[#fca5a5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">Stop following</button>
    </div>
  );
}

/**
 * Zoom, always in the same place: +, a vertical slider, −. It works while
 * following or previewing too: the camera keeps your zoom (ZoomKeeper).
 */
export const ZOOM_MIN = 9;
export const ZOOM_MAX = 20;
function ZoomControl({ map }: { map: MapLibreMap | null }) {
  const [z, setZ] = useState(() => map?.getZoom() ?? 12);
  useEffect(() => {
    if (!map) return;
    const sync = () => setZ(map.getZoom());
    sync();
    map.on("zoom", sync);
    return () => { map.off("zoom", sync); };
  }, [map]);
  const set = (next: number) => map?.setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
  const step = "flex h-9 w-11 items-center justify-center text-[20px] font-semibold leading-none text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
  return (
    <div data-testid="zoom-control" className="pointer-events-auto flex w-11 flex-col items-center rounded-full border border-[#263449] bg-[rgba(15,23,42,0.92)] py-1 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
      <button type="button" aria-label="Zoom in" className={step} onClick={() => set(z + 1)}>+</button>
      <input type="range" aria-label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.1} value={z} onChange={(e) => set(Number(e.target.value))}
        className="h-24 w-6 cursor-pointer accent-[#60a5fa]" style={{ writingMode: "vertical-lr", direction: "rtl" }} />
      <button type="button" aria-label="Zoom out" className={step} onClick={() => set(z - 1)}>−</button>
    </div>
  );
}

function LocateButton({ map, className, style }: { map: MapLibreMap | null; className?: string; style?: React.CSSProperties }) {
  const { flyTo } = useMapState();
  const [asking, setAsking] = useState(false);
  const locate = () => {
    const here = sharedCoords();
    if (here) { flyTo({ lon: here.lon, lat: here.lat, zoom: Math.max(map?.getZoom() ?? 16, 16) }); return; }
    setAsking(true);
    void startSharing().then((c) => {
      setAsking(false);
      if (c) flyTo({ lon: c.lon, lat: c.lat, zoom: 16 });
    });
  };
  return (
    <button type="button" aria-label="Center on my location" aria-busy={asking} onClick={locate} data-testid="locate-button"
      className={`${ROUND} border border-[#263449] bg-[rgba(15,23,42,0.92)] pointer-events-auto text-[#60a5fa] ${asking ? "animate-pulse motion-reduce:animate-none" : ""} ${className ?? ""}`} style={style}>
      <LocateIcon />
    </button>
  );
}

function Compass({ map, bearing, style }: { map: MapLibreMap; bearing: number; style?: React.CSSProperties }) {
  return (
    <button type="button" aria-label={`Compass, bearing ${Math.round(bearing)} degrees. Reset north and flat`} data-testid="compass"
      onClick={() => map.easeTo({ bearing: 0, pitch: 0 })} className={`${ROUND} ${DARK} pointer-events-auto`} style={style}>
      <span className="flex flex-col items-center leading-none" style={{ transform: `rotate(${-bearing}deg)` }}>
        <span className="block h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-[#ef4444]" aria-hidden />
        <span className="text-[11px] font-bold">N</span>
      </span>
    </button>
  );
}

export function MapChrome() {
  const { map, bearing, pitch } = useCamera();
  const line = useSelectedLine();
  const followed = useFollowed();
  // One dropdown at a time across the menu row and this view menu.
  const open = useOpenMenu() === "view" ? "view" : null;
  const setOpen = (v: "view" | null) => setOpenMenu(v);
  const stack = useRef<HTMLDivElement>(null);
  const rotated = Math.abs(bearing) > 0.5 || pitch > 0.5;

  // A tap anywhere else, or Escape, closes the open panel or menu.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!stack.current?.contains(e.target as Node)) setOpenMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => { if (line && open) setOpenMenu(null); }, [line, open]);

  const top = "calc(env(safe-area-inset-top) + 16px)";
  // Following: the same quick bar, with the follow cameras under Change view.
  if (followed) {
    return (
      <div ref={stack} data-testid="map-chrome" className="pointer-events-none absolute right-4 z-40 flex flex-col items-end gap-2.5" style={{ top }}>
        <div className="relative">
          <button type="button" aria-label="Change view" aria-haspopup="menu" aria-expanded={open === "view"} data-testid="view-button"
            onClick={() => setOpen(open === "view" ? null : "view")} className={`${ROUND} ${open === "view" ? LIGHT : DARK} pointer-events-auto`}>
            <ViewIcon />
          </button>
          {open === "view" ? <div className="pointer-events-auto absolute right-[52px] top-0"><FollowViewMenu onPick={() => setOpen(null)} /></div> : null}
        </div>
        <ZoomControl map={map} />
        <LocateButton map={map} />
      </div>
    );
  }
  // A line is selected: its close button takes the top right; locate drops above the chat bar.
  if (line) {
    return (
      <>
        {rotated && map ? <Compass map={map} bearing={bearing} style={{ position: "absolute", top, right: 68, zIndex: 45 }} /> : null}
        <LocateButton map={map} className="absolute right-4 z-40" style={{ bottom: "calc(var(--chat-bar-h, 0px) + 24px + env(safe-area-inset-bottom))" }} />
      </>
    );
  }
  return (
    <div ref={stack} data-testid="map-chrome" className="pointer-events-none absolute right-4 z-40 flex flex-col items-end gap-2.5" style={{ top }}>
      <div className="relative">
        <button type="button" aria-label="Change view" aria-haspopup="menu" aria-expanded={open === "view"} data-testid="view-button"
          onClick={() => setOpen(open === "view" ? null : "view")} className={`${ROUND} ${open === "view" ? LIGHT : DARK} pointer-events-auto`}>
          <ViewIcon />
        </button>
        {open === "view" ? (
          <div className="pointer-events-auto absolute right-[52px] top-0">
            <ViewMenu pitch={pitch} onPick={() => setOpen(null)} />
          </div>
        ) : null}
      </div>
      {/* Quick bar, top to bottom: Change view, zoom, the compass (only while rotated or tilted), Center on my location. */}
      <ZoomControl map={map} />
      {rotated && map ? <Compass map={map} bearing={bearing} /> : null}
      <LocateButton map={map} />
    </div>
  );
}
