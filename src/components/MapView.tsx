import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { type MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatCount, formatPercent } from "@/lib/format";
import { LAYER_METRICS, type ColumnDatum, type ColumnModel } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { buildNtaLayers, type HoverInfo } from "./NtaColumnsLayer";

const TILE_URL =
  import.meta.env.VITE_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [TILE_URL],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
      paint: {
        "raster-brightness-min": 0.03,
        "raster-brightness-max": 0.58,
        "raster-saturation": -0.32,
        "raster-contrast": 0.08,
      },
    },
  ],
};

function initialZoom(): number {
  if (typeof window === "undefined") return 10.4;
  if (window.innerWidth < 640) return 9.9;
  if (window.innerWidth < 1024) return 10.3;
  return 10.8;
}

function tooltipDetail(datum: ColumnDatum, layer: ColumnModel["layer"]): string {
  if (layer === "noise") {
    return `${formatPercent(datum.nightShare)} after 10pm`;
  }
  if (layer === "crashes") {
    return `${formatCount(datum.injured)} injured · ${formatCount(
      datum.killed,
    )} killed`;
  }
  return `${formatCount(datum.noiseCount)} noise · ${formatCount(
    datum.crashCount,
  )} crashes`;
}

export function MapView({ columns }: { columns: ColumnModel }) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const {
    layer,
    cameraTarget,
    highlightedNtaCodes,
    selectedNtaCode,
    selectNta,
  } = useMapState();
  const reducedMotion = usePrefersReducedMotion();

  const viewState = useMemo(
    () => ({
      longitude: -73.94,
      latitude: 40.7,
      zoom: initialZoom(),
      pitch: 50,
      bearing: -17,
    }),
    [],
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || overlayRef.current) return;
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    // deck.gl's IControl typings pin a different maplibre build than the one
    // react-map-gl ships; the runtime contract is identical.
    (
      map as unknown as { addControl: (control: MapboxOverlay) => void }
    ).addControl(overlay);
    overlayRef.current = overlay;
    setReady(true);
  }, []);

  const handleHover = useCallback((info: HoverInfo | null) => {
    setHover(info);
  }, []);

  const handleSelect = useCallback(
    (ntaCode: string) => {
      selectNta(ntaCode);
    },
    [selectNta],
  );

  useEffect(() => {
    if (!ready) return;
    const layers = buildNtaLayers({
      data: columns.data,
      layer,
      highlightedNtaCodes,
      selectedNtaCode,
      animate: !reducedMotion,
      onHover: handleHover,
      onSelect: handleSelect,
    });
    overlayRef.current?.setProps({ layers });
  }, [
    ready,
    columns.data,
    layer,
    highlightedNtaCodes,
    selectedNtaCode,
    reducedMotion,
    handleHover,
    handleSelect,
  ]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const center: [number, number] = [cameraTarget.lon, cameraTarget.lat];
    const zoom = cameraTarget.zoom ?? 13;
    const pitch = cameraTarget.pitch ?? 50;
    const bearing = cameraTarget.bearing ?? map.getBearing();
    if (reducedMotion) {
      map.jumpTo({ center, zoom, pitch, bearing });
    } else {
      map.flyTo({ center, zoom, pitch, bearing, duration: 1400, essential: true });
    }
  }, [ready, cameraTarget, reducedMotion]);

  const hoverLabel = layer === "noise" ? "Noise complaints" : "Incidents";

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={viewState}
        maxPitch={70}
        minZoom={8}
        maxZoom={17}
        onLoad={handleLoad}
        style={{ position: "absolute", inset: 0 }}
      />

      {hover ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 240),
            top: Math.max(hover.y - 10, 8),
          }}
        >
          <div className="text-[13px] font-semibold text-foreground">
            {hover.object.ntaName}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {hover.object.borough}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-base font-semibold tabular-nums text-primary">
              {formatCount(hover.object.count)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {hoverLabel.toLowerCase()}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {tooltipDetail(hover.object, layer)}
          </div>
          <div className="mt-1 border-t border-border/60 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            {LAYER_METRICS[layer].color}
          </div>
        </div>
      ) : null}
    </div>
  );
}
