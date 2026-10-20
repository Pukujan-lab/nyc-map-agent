import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapLibreMap, {
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import { blockKey } from "@/lib/geo/blocks";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import {
  HOME_VIEW,
  LAYER_METRICS,
  rgbaToCss,
  type BlockDatum,
  type MapModel,
  type NeighborhoodDatum,
} from "@/lib/layers";
import {
  applyAtmosphere,
  BASEMAP_STYLE_URL,
  installDataLayers,
} from "@/lib/map/basemap";
import {
  blockSelectionToGeoJson,
  blocksToGeoJson,
  emphasisToGeoJson,
  neighborhoodsToGeoJson,
} from "@/lib/map/geojson";
import { LAYER_IDS, SOURCE_IDS, buildFallbackStyle } from "@/lib/map/style";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** How far the camera may tilt. Enough to look down a street, never a globe. */
const MAX_PITCH = 78;
/** The one tilt the "3D" button applies — low enough to see the horizon. */
const TILT_PITCH = 62;
/** Tilting from the citywide view drops in to where the buildings are. */
const TILT_MIN_ZOOM = 13.4;
/** Past this many degrees the map counts as tilted — for the button and the camera. */
const TILT_EPSILON = 5;

type Picked =
  | { kind: "neighborhood"; datum: NeighborhoodDatum }
  | { kind: "block"; datum: BlockDatum };

type HoverInfo = Picked & { x: number; y: number };

function initialZoom(): number {
  if (typeof window === "undefined") return HOME_VIEW.neighborhoodZoom;
  if (window.innerWidth < 640) return 9.9;
  if (window.innerWidth < 1024) return 10.5;
  return HOME_VIEW.neighborhoodZoom;
}

function detailForNeighborhood(
  datum: NeighborhoodDatum,
  layer: MapModel["layer"],
): string {
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

export function MapView({
  model,
  boundaries,
}: {
  model: MapModel;
  boundaries: NtaBoundary[] | null;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  /** Bumped whenever the style (re)loads, so the data is re-applied to fresh sources. */
  const [styleEpoch, setStyleEpoch] = useState(0);
  const fellBack = useRef(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const {
    layer,
    scale,
    tilted,
    setTilted,
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

  const neighborhoodGeoJson = useMemo(
    () => neighborhoodsToGeoJson(model.neighborhoods),
    [model.neighborhoods],
  );

  const blockGeoJson = useMemo(
    () => blocksToGeoJson(model.blocks),
    [model.blocks],
  );

  const emphasisGeoJson = useMemo(
    () =>
      emphasisToGeoJson(
        model.neighborhoods,
        highlightedNtaCodes,
        selectedNtaCode,
      ),
    [model.neighborhoods, highlightedNtaCodes, selectedNtaCode],
  );

  const selectionGeoJson = useMemo(
    () =>
      blockSelectionToGeoJson(
        selectedBlockKey
          ? (model.blocks.find((block) => block.key === selectedBlockKey) ??
              null)
          : null,
      ),
    [model.blocks, selectedBlockKey],
  );

  const neighborhoodById = useMemo(() => {
    const map = new Map<string, NeighborhoodDatum>();
    for (const datum of model.neighborhoods) map.set(datum.id, datum);
    return map;
  }, [model.neighborhoods]);

  const neighborhoodByCode = useMemo(() => {
    const map = new Map<string, NeighborhoodDatum>();
    for (const datum of model.neighborhoods) {
      if (!map.has(datum.ntaCode)) map.set(datum.ntaCode, datum);
    }
    return map;
  }, [model.neighborhoods]);

  const blockByKey = useMemo(() => {
    const map = new Map<string, BlockDatum>();
    for (const block of model.blocks) map.set(block.key, block);
    return map;
  }, [model.blocks]);

  const nameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const datum of model.neighborhoods) {
      map.set(datum.ntaCode, datum.ntaName);
    }
    return map;
  }, [model.neighborhoods]);

  const ntaIndex = useMemo(
    () => (boundaries ? new NtaIndex(boundaries) : null),
    [boundaries],
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    installDataLayers(map);
    applyAtmosphere(map);
    setStyleEpoch((epoch) => epoch + 1);
    setReady(true);
    // A style swap (the raster fallback) replaces every source, so the data
    // has to be re-attached and re-pushed.
    map.on("style.load", () => {
      installDataLayers(map);
      setStyleEpoch((epoch) => epoch + 1);
    });
  }, []);

  /**
   * If the vector basemap cannot be fetched the map would otherwise stay
   * blank, so fall back once to the bundled raster style. Tile errors are
   * survivable; only an unloaded style is not.
   */
  const handleError = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || fellBack.current || map.isStyleLoaded()) return;
    fellBack.current = true;
    map.setStyle(buildFallbackStyle());
  }, []);

  /**
   * Prefer MapLibre's own 3D picking; fall back to arithmetic when a query
   * comes back empty. Blocks are an exact grid and neighborhoods are indexed,
   * so both fallbacks are O(1) — the map stays clickable even if a layer's
   * render pass yields nothing.
   */
  const pickAt = useCallback(
    (
      x: number,
      y: number,
      lngLat: { lat: number; lng: number },
    ): Picked | null => {
      const map = mapRef.current?.getMap();
      const pickLayer =
        scale === "blocks" ? LAYER_IDS.blocks : LAYER_IDS.neighborhoods;
      // `getLayer` is undefined until the style has loaded, which is also when
      // querying would throw.
      const feature =
        map && map.getLayer(pickLayer)
          ? map.queryRenderedFeatures([x, y], { layers: [pickLayer] })[0]
          : undefined;
      const id = feature?.id;

      if (id !== undefined && id !== null) {
        const key = String(id);
        if (scale === "blocks") {
          const datum = blockByKey.get(key);
          if (datum) return { kind: "block", datum };
        } else {
          const datum = neighborhoodById.get(key);
          if (datum) return { kind: "neighborhood", datum };
        }
      }

      if (scale === "blocks") {
        const datum = blockByKey.get(blockKey(lngLat.lat, lngLat.lng).key);
        return datum ? { kind: "block", datum } : null;
      }
      const code = ntaIndex?.assignCode(lngLat.lat, lngLat.lng) ?? null;
      const datum = code ? neighborhoodByCode.get(code) : undefined;
      return datum ? { kind: "neighborhood", datum } : null;
    },
    [
      scale,
      blockByKey,
      neighborhoodById,
      neighborhoodByCode,
      ntaIndex,
    ],
  );

  const handleMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const picked = pickAt(event.point.x, event.point.y, event.lngLat);
      const map = mapRef.current?.getMap();
      if (map) {
        map.getCanvas().style.cursor = picked ? "pointer" : "";
      }
      setHover((current) => {
        if (!picked) return current ? null : current;
        return { ...picked, x: event.point.x, y: event.point.y };
      });
    },
    [pickAt],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const picked = pickAt(event.point.x, event.point.y, event.lngLat);
      if (!picked) return;
      if (picked.kind === "block") {
        selectBlock({ key: picked.datum.key, ntaCode: picked.datum.ntaCode });
      } else {
        selectNta(picked.datum.ntaCode);
      }
    },
    [pickAt, selectBlock, selectNta],
  );

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Keep the toggle honest when the user tilts with the mouse or touch.
    setTilted(map.getPitch() > TILT_EPSILON);
  }, [setTilted]);

  // Data: one `setData` per scale, plus the layout switch between the two.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const showBlocks = scale === "blocks";

    (map.getSource(SOURCE_IDS.neighborhoods) as GeoJSONSource | undefined)
      ?.setData(neighborhoodGeoJson);
    (map.getSource(SOURCE_IDS.blocks) as GeoJSONSource | undefined)?.setData(
      blockGeoJson,
    );

    map.setLayoutProperty(
      LAYER_IDS.blocks,
      "visibility",
      showBlocks ? "visible" : "none",
    );
    // With blocks on, neighborhoods drop to a flat tinted ground so the block
    // prisms are what carries height.
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-height",
      showBlocks ? 0 : ["get", "height"],
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-opacity",
      showBlocks ? 0.42 : 0.7,
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoodOutline,
      "line-opacity",
      showBlocks ? 0.3 : 1,
    );
  }, [ready, styleEpoch, neighborhoodGeoJson, blockGeoJson, scale]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    (map.getSource(SOURCE_IDS.emphasis) as GeoJSONSource | undefined)?.setData(
      emphasisGeoJson,
    );
    (
      map.getSource(SOURCE_IDS.blockSelection) as GeoJSONSource | undefined
    )?.setData(selectionGeoJson);
  }, [ready, styleEpoch, emphasisGeoJson, selectionGeoJson]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // The camera keeps whatever tilt and bearing the user chose; only a
    // `fly_to` that names a pitch changes it.
    const pitch =
      typeof cameraTarget.pitch === "number"
        ? Math.min(Math.max(cameraTarget.pitch, 0), MAX_PITCH)
        : map.getPitch();
    const camera = {
      center: [cameraTarget.lon, cameraTarget.lat] as [number, number],
      zoom: cameraTarget.zoom ?? 13,
      pitch,
      bearing: map.getBearing(),
    };
    if (reducedMotion) {
      map.jumpTo(camera);
    } else {
      map.flyTo({ ...camera, duration: 1200, essential: true });
    }
  }, [ready, cameraTarget, reducedMotion]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Only act when the camera disagrees with the requested state, so a
    // `fly_to` that carries its own pitch is not snapped back afterwards.
    const isTilted = map.getPitch() > TILT_EPSILON;
    if (tilted === isTilted) return;
    map.easeTo({
      pitch: tilted ? TILT_PITCH : 0,
      bearing: tilted ? map.getBearing() : 0,
      // From the citywide view a tilt would just be a floating plate; drop in
      // far enough that the buildings and streets carry the perspective.
      zoom: tilted ? Math.max(map.getZoom(), TILT_MIN_ZOOM) : map.getZoom(),
      duration: reducedMotion ? 0 : 900,
    });
  }, [ready, tilted, reducedMotion]);

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
    setTilted(false);
  }, [ready, navCommand, reducedMotion, setTilted]);

  const hoverNtaName =
    hover?.kind === "block"
      ? (nameByCode.get(hover.datum.ntaCode) ?? null)
      : null;

  return (
    <div className="absolute inset-0">
      <MapLibreMap
        ref={mapRef}
        mapStyle={BASEMAP_STYLE_URL}
        initialViewState={viewState}
        maxPitch={MAX_PITCH}
        minZoom={9}
        maxZoom={17.5}
        dragRotate
        touchPitch
        onLoad={handleLoad}
        onError={handleError}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMoveEnd={handleMoveEnd}
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
              style={{ backgroundColor: rgbaToCss(hover.datum.fill) }}
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
            {hover.kind === "block"
              ? "Click to open this neighborhood"
              : "Click for details"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
