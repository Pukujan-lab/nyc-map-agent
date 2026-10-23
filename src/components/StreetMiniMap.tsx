import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { coneRotation, miniStyle } from "@/lib/map/miniStyle";
import { dotsNear, useLiveDots } from "@/lib/transit/liveVehicles";

const DOTS = "mini-live-vehicles";
/** Live vehicles drawn on the inset: about what it shows at z15.5. */
const DOTS_RADIUS_M = 900;

/**
 * Street-level mini map: a small north-up inset (140 px phone, 200 px desktop)
 * in the bottom-right corner, above the credits and clear of the walk pad on
 * the left. "You are here" dot plus a heading cone that turns with the camera.
 * Live trains and buses show as line-coloured dots (underground ones hollow).
 * Tap it to leave street level at that spot; "Hide map" folds it away.
 */
export function StreetMiniMap({ main, getEye, onExit }: {
  main: MapLibreMap;
  getEye: () => { lon: number; lat: number; bearing: number } | null;
  onExit: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [bearing, setBearing] = useState(0);
  const miniRef = useRef<MapLibreMap | null>(null);
  const dots = useLiveDots();

  useEffect(() => {
    if (hidden || !box.current) return;
    const eye = getEye();
    const c = main.getCenter();
    const mini = new maplibregl.Map({
      container: box.current,
      style: miniStyle(main.getStyle()),
      center: eye ? [eye.lon, eye.lat] : [c.lng, c.lat],
      zoom: 15.5,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    miniRef.current = mini;
    mini.on("load", () => {
      mini.addSource(DOTS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mini.addLayer({ id: DOTS, type: "circle", source: DOTS, paint: {
        "circle-radius": ["case", ["get", "bus"], 3, 4],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "under"], 0, 1],
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 2,
      } });
    });
    const sync = () => {
      const e = getEye();
      if (e) mini.jumpTo({ center: [e.lon, e.lat] });
      setBearing(e?.bearing ?? main.getBearing());
    };
    sync();
    main.on("move", sync);
    return () => {
      main.off("move", sync);
      miniRef.current = null;
      mini.remove();
    };
  }, [main, getEye, hidden]);

  useEffect(() => {
    const mini = miniRef.current;
    const src = mini?.getSource<GeoJSONSource>(DOTS);
    if (!mini || !src) return;
    const c = getEye() ?? { lon: mini.getCenter().lng, lat: mini.getCenter().lat };
    src.setData(dotsNear(dots, c.lon, c.lat, DOTS_RADIUS_M));
  }, [dots, getEye]);

  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} className="absolute bottom-[calc(var(--edge)+168px)] lg:bottom-[calc(var(--edge)+36px)] right-[var(--edge)] z-20 h-8 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
        Show map
      </button>
    );
  }
  return (
    <div data-testid="street-minimap" data-vehicles={dots.length} className="absolute bottom-[calc(var(--edge)+168px)] lg:bottom-[calc(var(--edge)+36px)] right-[var(--edge)] z-20 flex flex-col items-end gap-[var(--sp-1)]">
      <button type="button" onClick={() => setHidden(true)} className="h-7 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
        Hide map
      </button>
      <button
        type="button"
        aria-label="Leave street level here"
        onClick={onExit}
        className="relative h-[140px] w-[140px] overflow-hidden rounded-[18px] border-2 border-foreground bg-card shadow-lg lg:h-[200px] lg:w-[200px]"
      >
        <div ref={box} className="pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            data-testid="minimap-cone"
            data-bearing={Math.round(coneRotation(bearing))}
            className="absolute h-14 w-14"
            style={{ transform: `rotate(${coneRotation(bearing)}deg)` }}
          >
            <div className="absolute bottom-1/2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[14px] border-b-[28px] border-x-transparent border-b-[hsl(var(--acc)/0.55)]" />
          </div>
          <div className="relative h-3.5 w-3.5 rounded-full border-2 border-card bg-foreground shadow" />
        </div>
      </button>
    </div>
  );
}
