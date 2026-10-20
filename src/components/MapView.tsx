import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapLibreMap, { type MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatCount, formatPercent } from "@/lib/format";
import {
  HOME_VIEW,
  LAYER_METRICS,
  type BlockDatum,
  type MapModel,
  type NeighborhoodDatum,
} from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { buildMapLayers, type HoverInfo } from "./MapLayers";

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
        // Lightened just enough that four saturated fills stay readable.
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 0.7,
        "raster-saturation": -0.35,
        "raster-contrast": 0.05,
      },
    },
  ],
};

function initialZoom(): number {
  if (typeof window === "undefined") return HOME_VIEW.neighborhoodZoom;
  // The map is flat, so the viewport width decides how much of the city fits.
  if (window.innerWidth < 640) return 9.9;
  if (window.innerWidth < 1024) return 10.5;
  return HOME_VIEW.neighborhoodZoom;
}

function cssColor(rgba: [number, number, number, number]): string {
  return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${(rgba[3] / 255).toFixed(2)})`;
}

function detailForNeighborhood(datum: NeighborhoodDatum, layer: MapModel["layer"]): string {
  if (layer === "noise") return `${formatPercent(datum.nightShare)} after 10pm`;
  if (layer === "crashes") {
    return `${formatCount(datum.injured)} injured · ${formatCount(datum.killed)} killed`;
  }
  return `${formatCount(datum.noiseCount)} noise · ${formatCount(datum.crashCount)} crashes`;
}

function detailForBlock(datum: BlockDatum, layer: MapModel["layer"]): string {
  if (layer === "noise") return `${formatCount(datum.nightCount)} after 10pm`;
  if (layer === "crashes") {
    return `${formatCount(datum.injured)} injured · ${formatCount(datum.killed)} killed`;
  }
  return `${formatCount(datum.noiseCount)} noise · ${formatCount(datum.crashCount)} crashes`;
}

export function MapView({ model }: { model: MapModel }) {
  const mapRef = useRef<MapRef | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const {
    layer,
    scale,
    cameraTarget,
    navCommand,
    highlightedNtaCodes,
    selectedNtaCode,
    selectedBlockKey,
    selectNta,
    selectBlock,
  } = useMapState();
  const reducedMotion = usePrefersReducedMotion();

  const viewState = useMemo(
    () => ({
      longitude: HOME_VIEW.lon,
      latitude: HOME_VIEW.lat,
      zoom: initialZoom(),
      pitch: 0,
      bearing: 0,
    }),
    [],
  );

  const nameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const datum of model.neighborhoods) {
      map.set(datum.ntaCode, datum.ntaName);
    }
    return map;
  }, [model.neighborhoods]);

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

  const handleSelectNta = useCallback(
    (ntaCode: string) => {
      selectNta(ntaCode);
    },
    [selectNta],
  );

  const handleSelectBlock = useCallback(
    (block: BlockDatum) => {
      selectBlock({ key: block.key, ntaCode: block.ntaCode });
    },
    [selectBlock],
  );

  useEffect(() => {
    if (!ready) return;
    const layers = buildMapLayers({
      neighborhoods: model.neighborhoods,
      blocks: model.blocks,
      layer,
      scale,
      highlightedNtaCodes,
      selectedNtaCode,
      selectedBlockKey,
      animate: !reducedMotion,
      onHover: handleHover,
      onSelectNta: handleSelectNta,
      onSelectBlock: handleSelectBlock,
    });
    overlayRef.current?.setProps({ layers });
  }, [
    ready,
    model.neighborhoods,
    model.blocks,
    layer,
    scale,
    highlightedNtaCodes,
    selectedNtaCode,
    selectedBlockKey,
    reducedMotion,
    handleHover,
    handleSelectNta,
    handleSelectBlock,
  ]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // The map is flat by design: no pitch, no bearing, no accidental tilt.
    const camera = {
      center: [cameraTarget.lon, cameraTarget.lat] as [number, number],
      zoom: cameraTarget.zoom ?? 13,
      pitch: 0,
      bearing: 0,
    };
    if (reducedMotion) {
      map.jumpTo(camera);
    } else {
      map.flyTo({ ...camera, duration: 1200, essential: true });
    }
  }, [ready, cameraTarget, reducedMotion]);

  useEffect(() => {
    if (!ready || !navCommand) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const duration = reducedMotion ? 0 : 260;
    if (navCommand.type === "zoom-in") {
      map.zoomIn({ duration });
      return;
    }
    if (navCommand.type === "zoom-out") {
      map.zoomOut({ duration });
      return;
    }
    map.jumpTo({
      center: [HOME_VIEW.lon, HOME_VIEW.lat],
      zoom: initialZoom(),
      pitch: 0,
      bearing: 0,
    });
  }, [ready, navCommand, reducedMotion]);

  const hoverNtaName =
    hover?.kind === "block" ? nameByCode.get(hover.datum.ntaCode) ?? null : null;

  return (
    <div className="absolute inset-0">
      <MapLibreMap
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={viewState}
        maxPitch={0}
        dragRotate={false}
        touchPitch={false}
        minZoom={9}
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
          {hover.kind === "neighborhood" ? (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                {hover.datum.ntaName}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {hover.datum.borough}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                {hoverNtaName ?? "Block"}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                ~300 m block
              </div>
            </>
          )}

          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 self-center rounded-sm"
              style={{ backgroundColor: cssColor(hover.datum.fill) }}
            />
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCount(hover.datum.value)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {LAYER_METRICS[layer].unit}
            </span>
          </div>

          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {hover.kind === "neighborhood"
              ? detailForNeighborhood(hover.datum, layer)
              : detailForBlock(hover.datum, layer)}
          </div>

          <div className="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/80">
            {hover.kind === "block" ? "Click to open this neighborhood" : "Click for details"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
