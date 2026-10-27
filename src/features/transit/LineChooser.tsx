import { useEffect, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { bulletFace, lineColor } from "@/lib/transit/bullets";
import { useScreenSize } from "@/lib/screen/screenSpace";
import type { LineChoice } from "./lineChoice";

/**
 * The lines where a tap landed (src/features/transit/lineChoice.ts): a row of bullets, plus the station when
 * the tap was on one. On a wide screen it sits just above the tapped spot and follows it as the map moves; on
 * a phone it docks above the chat bar so the spot stays in view. Esc, a pan or any other tap closes it.
 */
export function LineChooser({ map, at, choice, onLine, onStation, onClose }: {
  map: MaplibreMap; at: [number, number]; choice: LineChoice;
  onLine: (route: string) => void; onStation: () => void; onClose: () => void;
}) {
  const wide = useScreenSize() === "wide";
  const [, redraw] = useState(0);
  useEffect(() => {
    const move = () => redraw((n) => n + 1);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    map.on("move", move);
    map.on("dragstart", onClose);
    window.addEventListener("keydown", key);
    return () => { map.off("move", move); map.off("dragstart", onClose); window.removeEventListener("keydown", key); };
  }, [map, onClose]);
  const box = map.getContainer().getBoundingClientRect();
  const p = map.project(at);
  const style = wide
    ? { left: box.left + p.x, top: box.top + p.y, transform: "translate(-50%, calc(-100% - 14px))" }
    : { left: 16, right: 16, bottom: "calc(var(--chat-bar-h, 0px) + 16px)" };
  return (
    <div role="dialog" aria-label="Pick a line" data-testid="line-chooser" style={style}
      className={`fixed z-30 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1e293b]/95 p-1.5 text-white shadow-lg backdrop-blur ${wide ? "" : "justify-center overflow-x-auto"}`}>
      {choice.routes.map((r) => {
        const { text, darkText } = bulletFace(r);
        return (
          <button key={r} type="button" data-line={r} onClick={() => onLine(r)} aria-label={`${r} line`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-bold outline-offset-2"
            style={{ background: lineColor(r), color: darkText ? "#111111" : "#ffffff" }}>
            {text}
          </button>
        );
      })}
      {choice.station ? (
        <button type="button" onClick={onStation} data-station={choice.station.id}
          className="h-9 shrink-0 truncate rounded-full bg-white/10 px-3 text-[14px] font-semibold hover:bg-white/20" style={{ maxWidth: 200 }}>
          {choice.station.name} station
        </button>
      ) : null}
    </div>
  );
}
