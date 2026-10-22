import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { ScanEye } from "lucide-react";
import { useFlag } from "@/lib/flags";
import { useMapState } from "@/lib/store/MapStateContext";
import { setFollowMode, stopFollowing, useFollowMode, useFollowed, type FollowMode } from "@/lib/transit/follow";
import { useLinesControl } from "@/lib/transit/linesControl";
import { setStreetXray, useStreetXray } from "@/lib/transit/streetXray";
import { cn } from "@/lib/utils";

/** Camera levels: eye height (Street), ~60 m oblique (Mid), ~300 m tilted (Up), flat north-up (Top). */
export type ViewLevel = "street" | "mid" | "up" | "top";
export const MID_HEIGHT_M = 60;
export const UP_HEIGHT_M = 300;

/** Which level a camera is at, for the pressed segment. */
export function levelOf(walking: boolean, heightM: number, pitch: number): ViewLevel {
  if (walking) return "street";
  if (pitch < 5) return "top";
  return heightM < 150 ? "mid" : "up";
}

const LEVELS: Array<{ id: ViewLevel; label: string }> = [
  { id: "street", label: "Street" },
  { id: "mid", label: "Mid" },
  { id: "up", label: "Up" },
  { id: "top", label: "Top" },
];
const FOLLOW: Array<{ id: FollowMode; label: string; trainOnly?: boolean }> = [
  { id: "chase", label: "Chase" },
  { id: "side", label: "Side" },
  { id: "overhead", label: "Overhead" },
  { id: "cab", label: "Cab", trainOnly: true },
];

const seg = "h-8 rounded-full px-[var(--sp-3)] text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Two labelled groups on the map: how you look at the city (Street / Mid / Up /
 * Top, or the follow camera), and the train controls (X-ray, Lines, Stop
 * following). While following a vehicle the camera group switches the follow
 * camera instead.
 */
export function ViewSwitcher() {
  const { current } = useMap();
  const map = current?.getMap();
  const [pitch, setPitch] = useState(0);
  useEffect(() => {
    if (!map) return;
    const sync = () => setPitch(map.getPitch());
    sync();
    map.on("pitch", sync);
    return () => { map.off("pitch", sync); };
  }, [map]);
  const street = useFlag("streetLevel");
  const { walking, startWalk, stopWalk, navigate, setCameraHeight, cameraHeightM } = useMapState();
  const followed = useFollowed();
  const mode = useFollowMode();
  const xray = useStreetXray();
  const lines = useLinesControl();
  const level = levelOf(walking, cameraHeightM, pitch);
  const go = (l: ViewLevel) => {
    if (l === "street") { if (!walking) startWalk(); return; }
    if (l === "mid") { setCameraHeight(MID_HEIGHT_M); return; }
    if (l === "up") { setCameraHeight(UP_HEIGHT_M); return; }
    if (walking) { stopWalk(); window.setTimeout(() => navigate("north"), 750); } else navigate("north");
  };
  const train = followed !== null && !followed.startsWith("bus:");
  const pressed = "bg-foreground text-background";
  const idle = "text-foreground hover:bg-muted";
  return (
    <div
      data-testid="view-switcher"
      className="pointer-events-none absolute bottom-[calc(var(--edge)+96px)] left-1/2 z-[45] flex w-[calc(100%-var(--edge)*2)] max-w-[640px] -translate-x-1/2 flex-wrap items-center justify-center gap-[var(--sp-2)] lg:bottom-[calc(var(--edge)+36px)] lg:w-auto"
    >
      <div role="group" aria-label={followed ? "Follow camera" : "View level"} className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 shadow-md">
        {followed
          ? FOLLOW.filter((f) => train || !f.trainOnly).map((f) => (
            <button key={f.id} type="button" aria-pressed={mode === f.id} onClick={() => setFollowMode(f.id)}
              className={cn(seg, mode === f.id ? pressed : idle)}>{f.label}</button>
          ))
          : LEVELS.filter((l) => street || l.id !== "street").map((l) => (
            <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => go(l.id)}
              className={cn(seg, level === l.id ? pressed : idle)}>{l.label}</button>
          ))}
      </div>
      <div role="group" aria-label="Trains" className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 shadow-md">
        <button type="button" aria-pressed={xray} data-testid="xray-toggle" onClick={() => setStreetXray(!xray)}
          className={cn(seg, "flex items-center gap-1", xray ? pressed : idle)}>
          <ScanEye className="h-3.5 w-3.5" aria-hidden="true" /> X-ray
        </button>
        {lines ? (
          <button type="button" onClick={lines.open} data-testid="lines-button" className={cn(seg, idle)}>
            Lines{lines.count ? ` · ${lines.count}` : ""}
          </button>
        ) : null}
        {followed ? (
          <button type="button" onClick={() => stopFollowing()} className={cn(seg, idle)}>
            Stop following
          </button>
        ) : null}
      </div>
    </div>
  );
}
