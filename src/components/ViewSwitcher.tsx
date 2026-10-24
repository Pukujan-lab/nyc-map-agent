import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { ScanEye } from "lucide-react";
import { useFlag } from "@/lib/flags";
import { useMapState } from "@/lib/store/MapStateContext";
import { setFollowMode, stopFollowing, useFollowMode, useFollowed, type FollowMode } from "@/lib/transit/follow";
import { useLinesControl } from "@/lib/transit/linesControl";
import { setStreetXray, useStreetXray } from "@/lib/transit/streetXray";
import { useMapOptions } from "@/lib/map/mapOptions";
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
 * One persistent, labelled control for how you look at the city: Street / Mid /
 * Up / Top as smooth camera moves in the one map, and X-ray beside it. While
 * following a vehicle the same control switches the follow camera instead.
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
  const level = levelOf(walking, cameraHeightM, pitch);
  const go = (l: ViewLevel) => {
    if (l === "street") { if (!walking) startWalk(); return; }
    if (l === "mid") { setCameraHeight(MID_HEIGHT_M); return; }
    if (l === "up") { setCameraHeight(UP_HEIGHT_M); return; }
    if (walking) { stopWalk(); window.setTimeout(() => navigate("north"), 750); } else navigate("north");
  };
  const train = followed !== null && !followed.startsWith("bus:");
  const openLines = useLinesControl();
  const isolated = useMapOptions().routes.length;
  return (
    <div
      data-testid="view-switcher"
      style={{ display: "var(--controls-display, flex)" }}
      className="pointer-events-none absolute bottom-[calc(var(--edge)+96px+var(--chat-bar-h,0px))] left-[max(var(--edge),var(--sheet-left,0px))] right-[var(--edge)] z-[35] flex flex-wrap items-center justify-center gap-[var(--sp-2)] lg:bottom-[calc(var(--edge)+36px+var(--chat-bar-h,0px))] lg:right-[calc(var(--edge)+340px)]"
    >
      <div role="group" aria-label={followed ? "Follow camera" : "View level"} className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 shadow-md">
        {followed
          ? FOLLOW.filter((f) => train || !f.trainOnly).map((f) => (
            <button key={f.id} type="button" aria-pressed={mode === f.id} onClick={() => setFollowMode(f.id)}
              className={cn(seg, mode === f.id ? "bg-foreground text-background" : "text-foreground hover:bg-muted")}>{f.label}</button>
          ))
          : LEVELS.filter((l) => street || l.id !== "street").map((l) => (
            <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => go(l.id)}
              className={cn(seg, level === l.id ? "bg-foreground text-background" : "text-foreground hover:bg-muted")}>{l.label}</button>
          ))}
      </div>
      <button type="button" aria-pressed={xray} data-testid="xray-toggle" onClick={() => setStreetXray(!xray)}
        className={cn(seg, "pointer-events-auto flex items-center gap-1 border border-border shadow-md", xray ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted")}>
        <ScanEye className="h-3.5 w-3.5" aria-hidden="true" /> X-ray
      </button>
      {followed ? (
        <button type="button" onClick={() => stopFollowing()} className={cn(seg, "pointer-events-auto border border-border bg-card text-foreground shadow-md hover:bg-muted")}>
          Stop following
        </button>
      ) : null}
      {openLines ? (
        <button type="button" onClick={openLines} data-testid="lines-button" className={cn(seg, "pointer-events-auto border border-border bg-card text-foreground shadow-md hover:bg-muted")}>
          Lines{isolated ? ` · ${isolated}` : ""}
        </button>
      ) : null}
    </div>
  );
}
