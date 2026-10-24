import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { RestroomDetails } from "@/components/RestroomCard";
import type { RestroomInfo } from "@/lib/map/restrooms";
import { applyInsetFilters, bearingTo, coneRotation, facingLabel, miniStyle, refreshInsetSource, whereLabel, type InsetFilters } from "@/lib/map/miniStyle";
import { metresBetween } from "@/lib/map/walk";
import { pushPanel } from "@/lib/store/PanelContext";
import { setFollowed } from "@/lib/transit/follow";
import { dotsNear, useLiveDots } from "@/lib/transit/liveVehicles";

const DOTS = "mini-live-vehicles";
/** Live vehicles drawn on the inset: about what it shows at z15.5. */
const DOTS_RADIUS_M = 900;

interface NearestRestroom { info: RestroomInfo; metres: number; bearing: number }

function openRestroom(info: RestroomInfo, distanceLabel?: string): void {
  pushPanel({
    id: `restroom:${info.lon.toFixed(5)},${info.lat.toFixed(5)}`,
    title: info.name,
    subtitle: distanceLabel ?? "Public restroom",
    details: <RestroomDetails restroom={info} distanceLabel={distanceLabel} />,
  });
}

/**
 * Street-level mini map: a small north-up inset (140 px phone, 200 px desktop)
 * in the bottom-right corner, above the credits and clear of the walk pad on
 * the left. Flat building footprints, streets, a "You" dot and a heading cone
 * that turns with the camera. Live trains and buses show as line-coloured dots.
 * Point layers for Layers switches that are on are copied from the main map
 * and dropped again when the switch goes off. Public restrooms are one tappable
 * layer of its own (`mini-restrooms`). "Hide map" folds it away; "Leave street
 * view" stands you back up.
 */
export function StreetMiniMap({ main, getEye, onExit, filters }: {
  main: MapLibreMap;
  getEye: () => { lon: number; lat: number; bearing: number } | null;
  onExit: () => void;
  filters: InsetFilters;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [bearing, setBearing] = useState(0);
  const miniRef = useRef<MapLibreMap | null>(null);
  // The closest restroom to the eye, even when it is past the inset's edge.
  const [nearest, setNearest] = useState<NearestRestroom | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const dots = useLiveDots();
  const facing = facingLabel(bearing);
  const filtersKey = `${filters.busStops ? 1 : 0}|${filters.placeClasses.join(",")}|${[...filters.on].join(",")}`;

  useEffect(() => {
    if (hidden || !box.current) return;
    const eye = getEye();
    const c = main.getCenter();
    const full = main.getStyle() ?? { version: 8 as const, sources: {}, layers: [] };
    const mini = new maplibregl.Map({
      container: box.current,
      style: miniStyle(full, filtersRef.current),
      center: eye ? [eye.lon, eye.lat] : [c.lng, c.lat],
      zoom: 15.5,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    miniRef.current = mini;
    let shown = "";
    let at = { lng: 0, lat: 0 };
    let alive = true;
    const syncRestrooms = () => {
      const e = getEye();
      if (!e || !mini.getSource("mini-restrooms")) return;
      if (shown && metresBetween([e.lon, e.lat], [at.lng, at.lat]) < 20) return;
      at = { lng: e.lon, lat: e.lat };
      void import("@/lib/map/restrooms").then((mod) => {
        if (!alive) return;
        void mod.loadRestrooms().then((all) => {
          if (!alive || !mini.getSource("mini-restrooms")) return;
          const b = mini.getBounds();
          const view = mod.restroomsForView(all, [e.lon, e.lat], mini.getZoom(), {
            west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(),
          });
          const here: [number, number] = [e.lon, e.lat];
          const closest = mod.nearestRestrooms(all, here, 1).features[0];
          const info = closest ? mod.restroomInfo(closest) : null;
          setNearest(info ? { info, metres: metresBetween(here, [info.lon, info.lat]), bearing: bearingTo(here, [info.lon, info.lat]) } : null);
          const has = (f: GeoJSON.Feature) => view.features.some((v) => v.geometry?.type === "Point" && f.geometry?.type === "Point" && v.geometry.coordinates[0] === f.geometry.coordinates[0] && v.geometry.coordinates[1] === f.geometry.coordinates[1]);
          const next: GeoJSON.FeatureCollection = closest && !has(closest) ? { type: "FeatureCollection", features: [...view.features, closest] } : view;
          const key = next.features.map((f) => {
            if (f.geometry?.type !== "Point") return "";
            const [lon, lat] = f.geometry.coordinates as [number, number];
            return `${lon.toFixed(4)},${lat.toFixed(4)}`;
          }).join("|");
          if (key === shown) return;
          shown = key;
          mod.setMiniRestrooms(mini, next);
        });
      });
    };
    mini.on("load", () => {
      // Points under the dots. Camera bearing and pitch stay at the north-up values above.
      applyInsetFilters(mini, main, filtersRef.current, DOTS);
      mini.addSource(DOTS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mini.addLayer({ id: DOTS, type: "circle", source: DOTS, paint: {
        "circle-radius": ["case", ["get", "bus"], 3, 4],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "under"], 0, 1],
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": 2,
      } });
      void import("@/lib/map/restrooms").then((mod) => {
        if (!alive) return;
        mod.mountMiniRestrooms(mini);
        shown = "";
        syncRestrooms();
      });
      mini.resize();
    });
    const sync = () => {
      const e = getEye();
      if (e) mini.jumpTo({ center: [e.lon, e.lat] });
      setBearing(e?.bearing ?? main.getBearing());
      syncRestrooms();
    };
    sync();
    main.on("move", sync);
    return () => {
      alive = false;
      main.off("move", sync);
      miniRef.current = null;
      mini.remove();
    };
  }, [main, getEye, hidden]);

  // Filter toggles, and layers that mount a moment later, update this inset in place.
  useEffect(() => {
    if (hidden) return;
    let queued = 0;
    const run = () => {
      const mini = miniRef.current;
      if (mini) applyInsetFilters(mini, main, filtersRef.current, DOTS);
    };
    const schedule = () => {
      if (queued) return;
      queued = window.setTimeout(() => {
        queued = 0;
        run();
      }, 0);
    };
    const onSource = (e: { sourceDataType?: string; sourceId?: string }) => {
      if (e.sourceDataType !== "content" || !e.sourceId) return;
      const mini = miniRef.current;
      if (mini) refreshInsetSource(mini, main, e.sourceId);
    };
    schedule();
    main.on("styledata", schedule);
    main.on("sourcedata", onSource);
    return () => {
      window.clearTimeout(queued);
      main.off("styledata", schedule);
      main.off("sourcedata", onSource);
    };
  }, [main, hidden, filtersKey]);

  useEffect(() => {
    const mini = miniRef.current;
    const src = mini?.getSource<GeoJSONSource>(DOTS);
    if (!mini || !src) return;
    const c = getEye() ?? { lon: mini.getCenter().lng, lat: mini.getCenter().lat };
    src.setData(dotsNear(dots, c.lon, c.lat, DOTS_RADIUS_M));
  }, [dots, getEye]);

  const onMiniClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const mini = miniRef.current;
    const el = box.current;
    if (!mini || !el || !mini.getLayer("mini-restrooms")) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const f = mini.queryRenderedFeatures([[x - 24, y - 24], [x + 24, y + 24]], { layers: ["mini-restrooms"] })[0];
    if (!f) return;
    void import("@/lib/map/restrooms").then((mod) => {
      const info = mod.restroomInfo(f);
      if (!info) return;
      openRestroom(info);
    });
  };

  if (hidden) {
    return (
      <button type="button" onClick={() => { setFollowed(null); setHidden(false); }} className="absolute bottom-[calc(var(--edge)+168px)] lg:bottom-[calc(var(--edge)+36px)] right-[var(--edge)] z-20 h-8 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
        Show map
      </button>
    );
  }
  return (
    <div data-testid="street-minimap" data-vehicles={dots.length} className="absolute bottom-[calc(var(--edge)+168px)] lg:bottom-[calc(var(--edge)+36px)] right-[var(--edge)] z-20 flex flex-col items-end gap-[var(--sp-1)]">
      <div className="flex gap-[var(--sp-1)]">
        <button type="button" onClick={() => setHidden(true)} className="h-7 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
          Hide map
        </button>
        <button type="button" onClick={onExit} className="h-7 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
          Leave street view
        </button>
      </div>
      <button
        type="button"
        aria-label={`Street map. You are here, ${facing}. Click a restroom for details.`}
        onClick={onMiniClick}
        className="relative h-[140px] w-[140px] overflow-hidden rounded-[18px] border-2 border-foreground bg-[#F2F1ED] p-0 text-left shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-[200px] lg:w-[200px]"
      >
        <div ref={box} className="absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="relative h-16 w-16">
            <div
              data-testid="minimap-cone"
              data-bearing={Math.round(coneRotation(bearing))}
              className="absolute inset-0"
              style={{ transform: `rotate(${coneRotation(bearing)}deg)` }}
            >
              <div
                className="absolute bottom-1/2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[16px] border-b-[34px] border-x-transparent"
                style={{ borderBottomColor: "#c6f702" }}
              />
            </div>
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#c6f702] bg-[#121212]" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded-full bg-[#F2F1ED]/95 px-1 py-0.5 text-center text-[10px] font-semibold leading-tight text-[#121212]">
          You · {facing}
        </div>
      </button>
      {nearest ? (
        <button
          type="button"
          data-testid="minimap-nearest-restroom"
          onClick={() => openRestroom(nearest.info, `${whereLabel(nearest.metres, nearest.bearing)} from you`)}
          className="flex h-7 items-center gap-1 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md"
        >
          <span aria-hidden className="inline-block" style={{ transform: `rotate(${Math.round(nearest.bearing)}deg)` }}>↑</span>
          Nearest restroom · {whereLabel(nearest.metres, nearest.bearing)}
        </button>
      ) : null}
    </div>
  );
}
