import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapLibreMap, {
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { LngLat, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import { blockKey } from "@/lib/geo/blocks";
import { boroughOutlinesToGeoJson } from "@/lib/geo/boroughs";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import { areasToGeoJson, blockPointsToGeoJson, type AreaDatum } from "@/lib/geo/areas";
import {
  HOME_VIEW,
  LAYER_METRICS,
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
import { fetchNearestStreet, type WalkingRoute } from "@/lib/api/routing";
import { useDataView } from "@/lib/store/DataViewContext";
import type { CameraOptions, Map as MaplibreMapInstance } from "maplibre-gl";
import {
  approachBearing,
  clampLookPitch,
  EYE_HEIGHT_M,
  LOOK_AHEAD_M,
  LOOK_DEG_PER_PX,
  poseAlongRoute,
  resolveWalkInput,
  snapToStreet,
  stepPose,
  WALK_IDLE,
  WALK_KEYS,
  WALK_MAX_PITCH,
  WALK_MAX_ZOOM,
  WALK_PITCH,
  WALK_SPEED,
  type WalkInput,
} from "@/lib/map/walk";

/** Basemap road classes a pedestrian can stand in (no motorways, rail or ferries). */
const STREET_CLASSES = new Set(["minor", "service", "tertiary", "secondary", "primary", "trunk", "pedestrian", "living_street"]);

/** Street centrelines from the basemap's loaded vector tiles, as [lon, lat] lines. */
function streetLines(map: MaplibreMapInstance): Array<Array<[number, number]>> {
  if (!map.getSource("openmaptiles")) return [];
  const lines: Array<Array<[number, number]>> = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
    if (!STREET_CLASSES.has(String(f.properties?.class)) || f.properties?.brunnel === "tunnel") continue;
    const g = f.geometry;
    if (g.type === "LineString") lines.push(g.coordinates as Array<[number, number]>);
    else if (g.type === "MultiLineString") lines.push(...(g.coordinates as Array<Array<[number, number]>>));
  }
  return lines;
}

/** The walker's eye: where they stand, which way they face, how far they look up or down. */
interface Eye {
  lon: number;
  lat: number;
  bearing: number;
  pitch: number;
}

/**
 * Camera options for an eye 1.7 m above the pavement. MapLibre 5 derives the
 * centre, zoom and centre elevation from a camera position, so this is a real
 * pedestrian viewpoint rather than a steep pitch from a rooftop.
 */
function eyeCamera(map: MaplibreMapInstance, eye: Eye): CameraOptions {
  // Aim at a point LOOK_AHEAD_M along the street, raised or lowered to match
  // the look angle. Keeping that target near the ground keeps the map centre
  // (and so tile LOD) on the street around you rather than kilometres away.
  const rad = (eye.bearing * Math.PI) / 180;
  const cosLat = Math.cos((eye.lat * Math.PI) / 180);
  const to: [number, number] = [
    eye.lon + (LOOK_AHEAD_M * Math.sin(rad)) / (111_320 * cosLat),
    eye.lat + (LOOK_AHEAD_M * Math.cos(rad)) / 111_320,
  ];
  const toAlt = EYE_HEIGHT_M - LOOK_AHEAD_M / Math.tan((eye.pitch * Math.PI) / 180);
  return map.calculateCameraOptionsFromTo(new LngLat(eye.lon, eye.lat), EYE_HEIGHT_M, new LngLat(to[0], to[1]), toAlt);
}
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { WalkControls } from "./WalkControls";

/**
 * How far the camera may tilt — MapLibre's own ceiling. Anything less and walk
 * mode cannot reach eye level, because pitch is the only altitude control the
 * map has besides zoom.
 */
const MAX_PITCH = 85;
/** The one tilt the "3D" button applies — low enough to see the horizon. */
const TILT_PITCH = 62;
/** Tilting from the citywide view drops in to where the buildings are. */
const TILT_MIN_ZOOM = 13.4;
/** Past this many degrees the map counts as tilted — for the button and the camera. */
const TILT_EPSILON = 5;
/**
 * Coming back up from street level lands on a block-scale overhead rather than
 * at `WALK_ZOOM`: a flat map at 21 shows ~50 m of ground, which is no map at
 * all. Only applied when the camera is tighter than this.
 */
const WALK_EXIT_ZOOM = 15.5;

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
  areas,
  route = null,
}: {
  model: MapModel;
  boundaries: NtaBoundary[] | null;
  /** The model rolled up to the chosen unit (filled-areas view). */
  areas: AreaDatum[];
  /** Walking directions to draw (and optionally follow), if any. */
  route?: WalkingRoute | null;
}) {
  const {
    routeStart,
    routeEnd,
    routePicking,
    setRoutePoint,
    followingRoute,
    setFollowingRoute,
  } = useDataView();
  const routeRef = useRef<WalkingRoute | null>(route);
  const followRef = useRef(followingRoute);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    followRef.current = followingRoute;
  }, [followingRoute]);
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  /** Bumped whenever the style (re)loads, so the data is re-applied to fresh sources. */
  const [styleEpoch, setStyleEpoch] = useState(0);
  const fellBack = useRef(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  /** Where the walker is standing — the strip names the block, not just "Walking". */
  const [walkPlace, setWalkPlace] = useState<{
    name: string;
    detail: string;
  } | null>(null);
  /** So leaving walk mode can restore the overhead camera exactly once. */
  const wasWalking = useRef(false);
  /** The walker's eye pose; the camera is derived from it every frame. */
  const eyeRef = useRef<Eye | null>(null);

  const {
    layer,
    scale,
    mapStyle,
    city3d,
    tilted,
    setTilted,
    walking,
    walkRequest,
    stopWalk,
    cameraTarget,
    navCommand,
    highlightedNtaCodes,
    selectedNtaCode,
    selectedBlockKey,
    selectNta,
    selectBlock,
  } = useMapState();
  const reducedMotion = usePrefersReducedMotion();
  /** Held d-pad buttons. A ref, because it changes without needing a render. */
  const walkPad = useRef<WalkInput>(WALK_IDLE);

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

  const areaGeoJson = useMemo(() => areasToGeoJson(areas), [areas]);
  const blockPointGeoJson = useMemo(() => blockPointsToGeoJson(model.blocks), [model.blocks]);

  const blockGeoJson = useMemo(
    () => blocksToGeoJson(model.blocks),
    [model.blocks],
  );

  /**
   * Borough outlines are derived from the neighborhood rings, not fetched: the
   * edges two neighborhoods of the same borough share are interior, so only the
   * county line survives.
   */
  const boroughGeoJson = useMemo(
    () => boroughOutlinesToGeoJson(boundaries ?? []),
    [boundaries],
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

  /**
   * What is underfoot. Read from the block grid rather than by ray-casting the
   * boundaries, so walking can call this every time you cross a square edge
   * without paying for a point-in-polygon test.
   */
  const describeAt = useCallback(
    (lat: number, lon: number) => {
      const key = blockKey(lat, lon).key;
      const block = blockByKey.get(key);
      const ntaCode = block?.ntaCode ?? ntaIndex?.assignCode(lat, lon) ?? null;
      const name = ntaCode ? nameByCode.get(ntaCode) : undefined;
      if (!name) return null;
      return {
        name,
        detail: block
          ? `${formatCount(block.value)} ${LAYER_METRICS[layer].unit} in this block`
          : "No records in this block",
      };
    },
    [blockByKey, ntaIndex, nameByCode, layer],
  );

  /**
   * `describeAt` changes identity whenever the data does — a finished
   * aggregation, a layer switch, a new window. Read through a ref so those
   * changes cannot restart the walk: restarting the enter effect would fly the
   * camera back to where the walk began, and restarting the loop would drop
   * whatever keys are held.
   */
  const describeAtRef = useRef(describeAt);
  useEffect(() => {
    describeAtRef.current = describeAt;
  }, [describeAt]);

  /** The block grid, held in a ref for the same reason as `describeAt`. */
  const blocksRef = useRef(model.blocks);
  useEffect(() => {
    blocksRef.current = model.blocks;
  }, [model.blocks]);

  /** Ditto for the picked block — it decides where a walk starts. */
  const selectedKeyRef = useRef(selectedBlockKey);
  useEffect(() => {
    selectedKeyRef.current = selectedBlockKey;
  }, [selectedBlockKey]);

  /**
   * The nearest square that actually has records — where a walk starts when the
   * user pressed the button without picking a block first. Dropping the camera
   * into the middle of the East River is not a street.
   */
  const nearestPopulatedBlock = useCallback(
    (lat: number, lon: number): [number, number] | null => {
      const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
      let best: BlockDatum | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const block of blocksRef.current) {
        if (block.value <= 0) continue;
        const dy = block.center.lat - lat;
        const dx = (block.center.lon - lon) * cosLat;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = block;
        }
      }
      return best ? [best.center.lon, best.center.lat] : null;
    },
    [],
  );

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    installDataLayers(map);
    applyAtmosphere(map);
    setStyleEpoch((epoch) => epoch + 1);
    setReady(true);
    // Dev-only handle for headless QA (camera placement, fps sampling).
    if (import.meta.env.DEV) (window as unknown as { __map?: unknown }).__map = map;
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
      // At eye level a hover card would sit on top of the street you are
      // walking down, and the pavement underfoot is the whole point.
      if (walking) return;
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
    [pickAt, walking],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      // Picking a route endpoint takes priority over selecting an area.
      if (routePicking) {
        setRoutePoint(routePicking, { lon: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      // Clicks stay live at street level: picking the block underfoot opens
      // its details like it does overhead.
      const picked = pickAt(event.point.x, event.point.y, event.lngLat);
      if (!picked) return;
      if (picked.kind === "block") {
        selectBlock({ key: picked.datum.key, ntaCode: picked.datum.ntaCode });
      } else {
        selectNta(picked.datum.ntaCode);
      }
    },
    [pickAt, selectBlock, selectNta, routePicking, setRoutePoint],
  );

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // A walk is always pitched to the ceiling, so it would report the map as
    // "tilted" the whole time and light up the dock's 3D button.
    if (walking) return;
    // Keep the toggle honest when the user tilts with the mouse or touch.
    setTilted(map.getPitch() > TILT_EPSILON);
  }, [walking, setTilted]);

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
    (map.getSource(SOURCE_IDS.boroughs) as GeoJSONSource | undefined)?.setData(
      boroughGeoJson,
    );

    // Walking always stands on the block grid, whatever scale the drawer says,
    // because the neighborhood volumes step aside at eye level.
    map.setLayoutProperty(
      LAYER_IDS.blocks,
      "visibility",
      showBlocks || walking ? "visible" : "none",
    );
    // At eye level a block column is 60–1800 m of wall that you are standing
    // *inside*, so the prisms drop to a painted pavement and the basemap's own
    // buildings supply the city you walk through. A hand's width of height
    // keeps the pavement off the ground plane, where it would z-fight.
    map.setPaintProperty(
      LAYER_IDS.blocks,
      "fill-extrusion-height",
      walking ? 0.5 : ["get", "height"],
    );
    map.setPaintProperty(
      LAYER_IDS.blocks,
      "fill-extrusion-opacity",
      walking ? 0.32 : 0.45,
    );
    // The square grid is the block scale's line work, and it has nothing to say
    // while you are standing on one of the squares.
    map.setLayoutProperty(
      LAYER_IDS.blockOutline,
      "visibility",
      showBlocks && !walking ? "visible" : "none",
    );
    // Same for the picked block's rim: a wall standing above the column from
    // above, a painted curb around the block you are walking through.
    map.setPaintProperty(
      LAYER_IDS.blockSelection,
      "fill-extrusion-height",
      walking ? 1.5 : ["get", "height"],
    );
    // With blocks on, neighborhoods drop to a flat glass ground so the block
    // volumes are what carries height. While walking that ground would be
    // coplanar with the flattened blocks and z-fight, so it steps aside
    // entirely — at eye level the neighborhood layer has nothing to say.
    map.setLayoutProperty(
      LAYER_IDS.neighborhoods,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setLayoutProperty(
      LAYER_IDS.neighborhoodOutline,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setLayoutProperty(
      LAYER_IDS.boroughOutline,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-height",
      showBlocks ? 0 : ["get", "height"],
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-opacity",
      showBlocks ? 0.14 : 0.35,
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoodOutline,
      "line-opacity",
      showBlocks ? 0.28 : 1,
    );
    // A block's highlight belongs to the block scale; inside a neighborhood
    // volume it would just be a bright speck buried in the glass.
    for (const id of [LAYER_IDS.blockSelection, LAYER_IDS.blockSelectionEdge]) {
      map.setLayoutProperty(
        id,
        "visibility",
        showBlocks ? "visible" : "none",
      );
    }

    // Unit + style: the classic glass columns cover blocks and neighborhoods;
    // everything else (filled areas, district/borough columns, heatmap) reads
    // from the areas / block-points sources.
    (map.getSource(SOURCE_IDS.areas) as GeoJSONSource | undefined)?.setData(areaGeoJson);
    (map.getSource(SOURCE_IDS.blockPoints) as GeoJSONSource | undefined)?.setData(blockPointGeoJson);
    const coarse = scale === "districts" || scale === "boroughs";
    const classic = walking || (mapStyle === "columns" && !coarse);
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty(LAYER_IDS.areaFill, "visibility", vis(!walking && mapStyle === "fill"));
    map.setLayoutProperty(LAYER_IDS.areaColumns, "visibility", vis(!walking && mapStyle === "columns" && coarse));
    map.setLayoutProperty(LAYER_IDS.areaOutline, "visibility", vis(!walking && mapStyle !== "heat" && (mapStyle === "fill" || coarse)));
    map.setLayoutProperty(LAYER_IDS.heat, "visibility", vis(!walking && mapStyle === "heat"));
    if (!classic) {
      for (const id of [
        LAYER_IDS.neighborhoods,
        LAYER_IDS.blocks,
        LAYER_IDS.blockOutline,
        LAYER_IDS.neighborhoodOutline,
        LAYER_IDS.blockSelection,
        LAYER_IDS.blockSelectionEdge,
      ]) {
        map.setLayoutProperty(id, "visibility", "none");
      }
    }
  }, [
    ready,
    styleEpoch,
    neighborhoodGeoJson,
    blockGeoJson,
    boroughGeoJson,
    areaGeoJson,
    blockPointGeoJson,
    scale,
    mapStyle,
    walking,
  ]);

  // Textured 3D city: installed lazily the first time it is switched on.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    // Lazy chunk: users who never turn it on never download it.
    import("@/lib/map/city3d")
      .then(async ({ installCity3d, setCity3dVisible, city3dCoversView }) => {
        if (!city3d) {
          setCity3dVisible(map, false);
          return;
        }
        await installCity3d(map);
        if (cancelled) return;
        // Basemap buildings only step aside where textured tiles exist.
        let covered: boolean | null = null;
        const sync = () => {
          const now = city3dCoversView(map);
          if (now === covered) return;
          covered = now;
          setCity3dVisible(map, true, now);
        };
        setCity3dVisible(map, true, false);
        covered = false;
        map.on("idle", sync);
        cleanup = () => map.off("idle", sync);
      })
      .catch((err) => console.warn("3D city failed to load", err));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [ready, styleEpoch, city3d]);

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

  // Fog is measured from the camera, so it has to be re-tuned the moment the
  // camera drops from a kilometre up to eye level — otherwise the street is
  // behind an opaque grey wall.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    applyAtmosphere(map, walking);
    // At eye level basemap labels stand on the horizon and float in the sky,
    // so they step aside while walking; our own route markers stay.
    const own = new Set(Object.keys(SOURCE_IDS).map((k) => SOURCE_IDS[k as keyof typeof SOURCE_IDS] as string));
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== "symbol" || own.has((layer as { source?: string }).source ?? "")) continue;
      map.setLayoutProperty(layer.id, "visibility", walking ? "none" : "visible");
    }
  }, [ready, walking, styleEpoch]);

  // Entering walk mode is a camera move, not a mode flag: eye level is the
  // steepest pitch the map allows, at a zoom where buildings have height.
  useEffect(() => {
    if (!ready || !walking) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const center = map.getCenter();
    const picked = selectedKeyRef.current
      ? blocksRef.current.find((block) => block.key === selectedKeyRef.current)
      : undefined;
    const target: [number, number] = walkRequest
      ? [walkRequest.lon, walkRequest.lat]
      : picked
        ? [picked.center.lon, picked.center.lat]
        : // Standing in the middle of the East River is not a walk, so fall in
          // on the nearest square that actually has records.
          (nearestPopulatedBlock(center.lat, center.lng) ?? [
            center.lng,
            center.lat,
          ]);

    // Stand in the middle of the nearest street, facing along it: a block
    // centre or the map centre can be inside a building footprint.
    const snapped = snapToStreet(target, streetLines(map), map.getBearing());
    const eye: Eye = snapped
      ? { lon: snapped.lon, lat: snapped.lat, bearing: snapped.bearing, pitch: WALK_PITCH }
      : { lon: target[0], lat: target[1], bearing: map.getBearing(), pitch: WALK_PITCH };
    eyeRef.current = eye;
    map.easeTo({ ...eyeCamera(map, eye), duration: reducedMotion ? 0 : 900 });
    if (!snapped) {
      // No road tiles in view yet (e.g. entering from the citywide map): ask OSRM.
      const controller = new AbortController();
      fetchNearestStreet({ lon: target[0], lat: target[1] }, controller.signal)
        .then((p) => {
          if (!p || eyeRef.current !== eye) return;
          eye.lon = p.lon;
          eye.lat = p.lat;
          const aligned = snapToStreet([p.lon, p.lat], streetLines(map), eye.bearing, 30);
          if (aligned) eye.bearing = aligned.bearing;
          map.jumpTo(eyeCamera(map, eye));
        })
        .catch(() => {});
    }
    setWalkPlace(describeAtRef.current(target[1], target[0]));
    // `describeAt` is deliberately read through a ref: its identity changes
    // with the data, and re-running this would yank the camera back.
  }, [ready, walking, walkRequest, reducedMotion, nearestPopulatedBlock]);

  // Leaving a walk must not strand the camera nose-down at 85° over a rooftop,
  // so the pitch comes back up on its own — the tilt flag never went true while
  // walking, so nothing else would restore it.
  useEffect(() => {
    if (walking) {
      wasWalking.current = true;
      return;
    }
    if (!wasWalking.current) return;
    wasWalking.current = false;
    setWalkPlace(null);
    setTilted(false);
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    eyeRef.current = null;
    map.easeTo({
      pitch: 0,
      bearing: 0,
      elevation: 0,
      zoom: Math.min(map.getZoom(), WALK_EXIT_ZOOM),
      duration: reducedMotion ? 0 : 700,
    });
  }, [walking, ready, reducedMotion, setTilted]);

  // The walk loop. Each frame moves the camera in ground metres along its own
  // bearing, so speed is constant at any zoom and the horizon stays level.
  useEffect(() => {
    if (!ready || !walking) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const held = new Set<string>();
    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey) return;
      if (event.key === "Escape") {
        stopWalk();
        return;
      }
      if (!WALK_KEYS.has(event.code)) return;
      // Arrow keys would otherwise pan the map underneath the walk.
      event.preventDefault();
      held.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.code);
    };
    const onBlur = () => held.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let frame = 0;
    let last = performance.now();
    // Crossing a block edge is the only thing worth a React update: the strip
    // then says which block you are standing in and what happened there.
    const startEye = eyeRef.current;
    let standingOn = startEye
      ? blockKey(startEye.lat, startEye.lon).key
      : blockKey(map.getCenter().lat, map.getCenter().lng).key;
    // Drag (mouse or one finger) looks around: across turns, up/down tilts the
    // head. Map panning is off while walking, so the drag is ours alone.
    let lookDirty = false;
    let dragFrom: { x: number; y: number } | null = null;
    const canvas = map.getCanvas();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragFrom = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      const eye = eyeRef.current;
      if (!dragFrom || !eye) return;
      const dx = event.clientX - dragFrom.x;
      const dy = event.clientY - dragFrom.y;
      dragFrom = { x: event.clientX, y: event.clientY };
      // Grab-the-world feel: drag left to turn right, drag down to look up.
      eye.bearing = (eye.bearing - dx * LOOK_DEG_PER_PX + 360) % 360;
      eye.pitch = clampLookPitch(eye.pitch + dy * LOOK_DEG_PER_PX);
      lookDirty = true;
    };
    const onPointerUp = () => {
      dragFrom = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    let routeDistance = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const input = resolveWalkInput(held, walkPad.current);
      const followed = followRef.current ? routeRef.current : null;
      const eye = eyeRef.current;
      if (!eye) {
        frame = requestAnimationFrame(tick);
        return;
      }
      let moved = lookDirty;
      lookDirty = false;
      if (followed) {
        // Following directions: advance along the polyline at walking pace
        // (Shift / sprint still runs), turning smoothly into each segment.
        routeDistance +=
          WALK_SPEED * (input.sprint ? 3 : 1) * Math.min(Math.max(dt, 0), 0.2);
        const pose = poseAlongRoute(followed.coordinates, routeDistance);
        if (pose) {
          eye.lon = pose.lon;
          eye.lat = pose.lat;
          eye.bearing = approachBearing(eye.bearing, pose.bearing, dt);
          moved = true;
          if (pose.done) setFollowingRoute(false);
        }
      } else if (input.forward !== 0 || input.turn !== 0) {
        const next = stepPose(
          { lon: eye.lon, lat: eye.lat, bearing: eye.bearing, zoom: 0 },
          input,
          dt,
        );
        eye.lon = next.lon;
        eye.lat = next.lat;
        eye.bearing = next.bearing;
        moved = true;
      }
      if (moved) {
        // The camera is re-derived from the eye every frame: moving cancels
        // any camera animation in flight, and the eye never drifts upward.
        map.jumpTo(eyeCamera(map, eye));
        const key = blockKey(eye.lat, eye.lon).key;
        if (key !== standingOn) {
          standingOn = key;
          setWalkPlace(describeAtRef.current(eye.lat, eye.lon));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      held.clear();
      walkPad.current = WALK_IDLE;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // `describeAt` comes through a ref so a data refresh cannot tear down the
    // loop and drop the keys the walker is holding.
  }, [ready, walking, stopWalk, followingRoute, setFollowingRoute]);

  // Walking directions: one GeoJSON source holding the line and both ends.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    const source = map?.getSource(SOURCE_IDS.route) as GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    if (route) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.coordinates },
      });
    }
    if (routeStart) {
      features.push({
        type: "Feature",
        properties: { end: "start" },
        geometry: { type: "Point", coordinates: [routeStart.lon, routeStart.lat] },
      });
    }
    if (routeEnd) {
      features.push({
        type: "Feature",
        properties: { end: "end" },
        geometry: { type: "Point", coordinates: [routeEnd.lon, routeEnd.lat] },
      });
    }
    source.setData({ type: "FeatureCollection", features });
  }, [ready, styleEpoch, route, routeStart, routeEnd]);

  // A crosshair cursor says "the next click drops a route point".
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    map.getCanvas().style.cursor = routePicking ? "crosshair" : "";
  }, [ready, routePicking]);

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
    // "Reset view" means the city, not the street you were standing on.
    stopWalk();
  }, [ready, navCommand, reducedMotion, setTilted, stopWalk]);

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
        // Street level looks past the horizon (MapLibre 5 allows pitch > 85);
        // the overhead map keeps its 85° ceiling.
        attributionControl={{ compact: true }}
        maxPitch={walking ? WALK_MAX_PITCH : MAX_PITCH}
        minZoom={9}
        // An eye 1.7 m up sits around z22; the camera height comes from the
        // eye pose, not from scroll-zoom.
        maxZoom={walking ? WALK_MAX_ZOOM : 22}
        // The built-in arrow-key panning has to stand down while walking, or
        // every keypress would move the camera twice.
        keyboard={!walking}
        // Scroll-zoom stays on while walking (bounded by min/maxZoom above);
        // double-click, pinch-rotate and right-drag stay off so the pitch
        // cannot tip away from the street.
        scrollZoom={!walking}
        dragPan={!walking}
        doubleClickZoom={!walking}
        touchZoomRotate={!walking}
        dragRotate={!walking}
        touchPitch={!walking}
        onLoad={handleLoad}
        onError={handleError}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMoveEnd={handleMoveEnd}
        style={{ position: "absolute", inset: 0 }}
      />

      {walking ? (
        <WalkControls
          place={walkPlace}
          onInput={(input) => {
            walkPad.current = input;
          }}
          onExit={stopWalk}
        />
      ) : null}

      {hover && !walking ? (
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
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCount(hover.datum.value)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {model.view ? model.view.unit : LAYER_METRICS[layer].unit}
            </span>
          </div>

          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {model.view
              ? model.view.label
              : hover.kind === "neighborhood"
                ? detailForNeighborhood(hover.datum, layer)
                : detailForBlock(hover.datum, layer)}
          </div>

          <div className="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/80">
            Click for a quick look
          </div>
        </div>
      ) : null}
    </div>
  );
}
