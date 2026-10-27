import { useEffect, useRef } from "react";
import "@/lib/map/maplibreWorker";
import { Map as MapLibreMapCtor, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { miniStyle } from "@/lib/map/miniStyle";
import { setFollowMode, useFollowPos } from "./follow";
import type { Vehicle } from "./model";

const LINE = "follow-mini-line";
const TRAIN = "follow-mini-train";

/**
 * While a follow camera is on (Chase, Side, Top, Cab): a small north-up map in
 * the bottom-right corner, centred on the train, with its line in the line's
 * colour and the next station. A tap on it goes to the flat Map follow.
 */
export function FollowMiniMap({ main, vehicle, line, nextName }: {
  main: MapLibreMap;
  vehicle: Vehicle;
  /** The followed route's own track shapes. */
  line: GeoJSON.FeatureCollection;
  nextName: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const miniRef = useRef<MapLibreMap | null>(null);
  const pos = useFollowPos();
  const color = vehicle.color ?? "#0039A6";
  const lineRef = useRef(line);
  lineRef.current = line;

  useEffect(() => {
    if (!box.current) return;
    const full = main.getStyle() ?? { version: 8 as const, sources: {}, layers: [] };
    const mini = new MapLibreMapCtor({
      container: box.current,
      style: miniStyle(full),
      center: [vehicle.lon, vehicle.lat],
      zoom: 14,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    miniRef.current = mini;
    mini.on("load", () => {
      mini.addSource(LINE, { type: "geojson", data: lineRef.current });
      mini.addLayer({ id: LINE, type: "line", source: LINE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 4 } });
      mini.addSource(TRAIN, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mini.addLayer({ id: TRAIN, type: "circle", source: TRAIN, paint: { "circle-radius": 7, "circle-color": color, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      mini.resize();
    });
    return () => { miniRef.current = null; mini.remove(); };
  }, [main, vehicle.key, color]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void miniRef.current?.getSource<GeoJSONSource>(LINE)?.setData(line);
  }, [line]);

  useEffect(() => {
    const mini = miniRef.current;
    if (!mini || !pos) return;
    mini.jumpTo({ center: [pos.lon, pos.lat] });
    void mini.getSource<GeoJSONSource>(TRAIN)?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pos.lon, pos.lat] } });
  }, [pos]);

  return (
    <div data-testid="follow-minimap" className="absolute right-4 z-30 flex flex-col items-end gap-1"
      style={{ bottom: "calc(var(--chat-bar-h, 0px) + var(--pull-sheet-h, 0px) + 68px)" }}>
      <button type="button" aria-label={`Map of the train's line${nextName ? `. Next: ${nextName}` : ""}. Opens the map.`} onClick={() => setFollowMode("map")}
        className="relative h-[120px] w-[120px] overflow-hidden rounded-[18px] border-2 border-[#263449] bg-[#F2F1ED] p-0 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] sm:h-[180px] sm:w-[180px]">
        <div ref={box} className="absolute inset-0" />
        {/* Which way the train is heading: an arrow just ahead of its dot. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ transform: `rotate(${Math.round(pos?.bearing ?? vehicle.bearing ?? 0)}deg)` }}>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[26px] text-[14px] leading-none text-white [text-shadow:0_0_3px_#000]">▲</span>
        </div>
        {nextName ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-1 z-10 truncate rounded-full bg-[#F2F1ED]/95 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-[#121212]">
            Next: {nextName}
          </span>
        ) : null}
      </button>
    </div>
  );
}
