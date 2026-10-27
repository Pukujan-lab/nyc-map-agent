import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  parseLayerId,
  parseMapScale,
  parseMapStyle,
  type LayerId,
  type MapScale,
  type MapStyleId,
} from "@/lib/layers";
import { parseWindowId, type WindowId } from "@/lib/windows";
import { sendCamera, useCameraMode } from "@/lib/map/cameraMode";

export interface CameraTarget {
  lon: number;
  lat: number;
  zoom?: number;
  /** Omitted means "keep the tilt the user is already looking at". */
  pitch?: number;
  /** Omitted means "keep the heading the user is already looking at". */
  bearing?: number;
  /** Ease straight there instead of a fly arc: for following street photos step by step (#10). */
  glide?: boolean;
  /** Bumped on every request so repeat flights to the same place still fire. */
  nonce: number;
}

export type NavCommandType = "zoom-in" | "zoom-out" | "reset" | "north" | "height";

export interface NavCommand {
  type: NavCommandType;
  /** For "height": the camera height above the street, in metres. */
  heightM?: number;
  /** For "height": a tilt to use instead of the one the height implies (Aerial on the agent-first home). */
  pitch?: number;
  nonce: number;
}

export interface ChatSeed {
  id: string;
  text: string;
}

/** Where walking starts. Nonce so the same block can be re-entered. */
export interface WalkRequest {
  lon: number;
  lat: number;
  /** Face this way instead of along the nearest street. */
  heading?: number;
  /** Stand right here instead of snapping to the middle of the street. */
  exact?: boolean;
  nonce: number;
}

interface MapState {
  layer: LayerId;
  window: WindowId;
  scale: MapScale;
  /** How areas are drawn: filled polygons, 3D columns, or a heatmap. */
  mapStyle: MapStyleId;
  /** Textured 3D buildings and street props (pilot area, zoom 16+). */
  city3d: boolean;
  /** Public restrooms icon layer (restrooms=1 in the URL). */
  restrooms: boolean;
  /** Eco mode (eco=1): pixel ratio 1 and no textured city, to save battery. */
  eco: boolean;
  setRestrooms: (on: boolean) => void;
  setEco: (on: boolean) => void;
  /** True while the camera is pitched; drives the "3D" toggle's pressed state. */
  tilted: boolean;
  /** True while the camera is driven first-person from the keyboard. */
  walking: boolean;
  walkRequest: WalkRequest | null;
  selectedNtaCode: string | null;
  selectedBlockKey: string | null;
  highlightedNtaCodes: string[];
  cameraTarget: CameraTarget | null;
  navCommand: NavCommand | null;
  chatSeed: ChatSeed | null;
  chatOpen: boolean;
  caveatsOpen: boolean;
  /**
   * The details panel can be dismissed without dropping the selection — that is
   * what walk mode needs on mobile, where a sheet would cover the street you
   * are walking down.
   */
  detailsOpen: boolean;
  /**
   * A map click opens the *small* panel first (`detailsExpanded` false): the
   * headline numbers, over the map, without taking the screen. Expanding it
   * opens the full sheet with the charts and the query sources.
   */
  detailsExpanded: boolean;
  /** Street-level photos for the selected block. */
  streetViewOpen: boolean;
}

interface MapStateActions {
  setLayer: (layer: LayerId) => void;
  setWindow: (window: WindowId) => void;
  setScale: (scale: MapScale) => void;
  setMapStyle: (style: MapStyleId) => void;
  setCity3d: (on: boolean) => void;
  setTilted: (tilted: boolean) => void;
  /** Enter walk mode, optionally framing a point first. */
  startWalk: (target?: { lon: number; lat: number; heading?: number; exact?: boolean } | null) => void;
  stopWalk: () => void;
  selectNta: (ntaCode: string | null) => void;
  selectBlock: (block: { key: string; ntaCode: string } | null) => void;
  setHighlights: (ntaCodes: string[]) => void;
  flyTo: (target: Omit<CameraTarget, "nonce">) => void;
  navigate: (type: NavCommandType) => void;
  /** Moves the camera to this height (metres), from eye level to overhead. */
  setCameraHeight: (heightM: number, pitch?: number) => void;
  /** The camera's current height above the street, reported by the map. */
  cameraHeightM: number;
  reportCameraHeight: (heightM: number) => void;
  seedChat: (text: string) => void;
  clearSeed: () => void;
  setChatOpen: (open: boolean) => void;
  setCaveatsOpen: (open: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  setDetailsExpanded: (expanded: boolean) => void;
  setStreetViewOpen: (open: boolean) => void;
}

type MapStateContextValue = MapState & MapStateActions;

const MapStateContext = createContext<MapStateContextValue | null>(null);

export function MapStateProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const layer = parseLayerId(searchParams.get("layer"));
  const windowId = parseWindowId(searchParams.get("window"));
  const scale = parseMapScale(searchParams.get("scale"));
  const mapStyle = parseMapStyle(searchParams.get("style"));
  const city3dParam = searchParams.get("city3d");

  const [tilted, setTilted] = useState(false);
  // Street walking is one mode of the camera store, so it can't overlap guidance.
  const camera = useCameraMode();
  const walking = camera.kind === "street";
  // Street level defaults to the textured city; an explicit choice in the
  // Layers dropdown (city3d=0/1 in the URL) always wins.
  const eco = searchParams.get("eco") === "1";
  // Eco mode drops the textured city (its facades and props are the heaviest draw).
  const city3d = !eco && (city3dParam === "1" || (city3dParam === null && walking));
  // Restrooms are off by default so the open map stays clean (owner, 2026-10-24);
  // the Restroom task, an answer or the Layers switch (restrooms=1) shows them.
  const restrooms = searchParams.get("restrooms") === "1";
  const walkRequest: WalkRequest | null = camera.kind === "street" ? camera.target : null;
  const [selectedNtaCode, setSelectedNtaCode] = useState<string | null>(null);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [highlightedNtaCodes, setHighlighted] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [navCommand, setNavCommand] = useState<NavCommand | null>(null);
  const [cameraHeightM, setCameraHeightM] = useState(3000);
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [caveatsOpen, setCaveatsOpen] = useState(false);
  const [detailsOpen, setDetailsOpenState] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [streetViewOpen, setStreetViewOpen] = useState(false);

  // Closing the panel always collapses it: the next click must start small
  // again, or one dismiss would leave the full sheet primed for every pick.
  const setDetailsOpen = useCallback((open: boolean) => {
    setDetailsOpenState(open);
    if (!open) setDetailsExpanded(false);
  }, []);

  const updateSearch = useCallback(
    (key: "layer" | "window" | "scale" | "style" | "city3d" | "restrooms" | "eco", value: string) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setLayer = useCallback(
    (next: LayerId) => updateSearch("layer", next),
    [updateSearch],
  );

  const setWindow = useCallback(
    (next: WindowId) => updateSearch("window", next),
    [updateSearch],
  );

  const setScale = useCallback(
    (next: MapScale) => updateSearch("scale", next),
    [updateSearch],
  );

  const setMapStyle = useCallback(
    (next: MapStyleId) => updateSearch("style", next),
    [updateSearch],
  );

  const setCity3d = useCallback(
    (on: boolean) => updateSearch("city3d", on ? "1" : "0"),
    [updateSearch],
  );

  const setEco = useCallback(
    (on: boolean) => updateSearch("eco", on ? "1" : "0"),
    [updateSearch],
  );
  const setRestrooms = useCallback(
    (on: boolean) => updateSearch("restrooms", on ? "1" : "0"),
    [updateSearch],
  );

  const startWalk = useCallback(
    (target?: { lon: number; lat: number; heading?: number; exact?: boolean } | null) => {
      // Street level means the block grid: a neighborhood column is a wall you
      // would be standing inside.
      setScale("blocks");
      sendCamera({ type: "street", target });
    },
    [setScale],
  );

  const stopWalk = useCallback(() => sendCamera({ type: "leave-street" }), []);

  const selectNta = useCallback(
    (ntaCode: string | null) => {
      setSelectedNtaCode(ntaCode);
      // A fresh pick always starts as the small panel.
      setDetailsOpenState(ntaCode !== null);
      setDetailsExpanded(false);
      // Picking a neighborhood is a coarser selection, so drop any block — and
      // with it the street-level photos that block was showing.
      setSelectedBlockKey(null);
      setStreetViewOpen(false);
    },
    [],
  );

  const selectBlock = useCallback(
    (block: { key: string; ntaCode: string } | null) => {
      setSelectedBlockKey(block ? block.key : null);
      if (block) {
        setSelectedNtaCode(block.ntaCode);
        setDetailsOpenState(true);
        setDetailsExpanded(false);
      } else {
        setStreetViewOpen(false);
      }
    },
    [],
  );

  const setHighlights = useCallback((ntaCodes: string[]) => {
    setHighlighted(Array.from(new Set(ntaCodes)));
  }, []);

  const flyTo = useCallback((target: Omit<CameraTarget, "nonce">) => {
    setCameraTarget({ ...target, nonce: Date.now() });
  }, []);

  const navigate = useCallback((type: NavCommandType) => {
    setNavCommand({ type, nonce: Date.now() });
  }, []);

  const setCameraHeight = useCallback((heightM: number, pitch?: number) => {
    setNavCommand({ type: "height", heightM, ...(pitch === undefined ? {} : { pitch }), nonce: Date.now() });
  }, []);

  const reportCameraHeight = useCallback((heightM: number) => {
    // Rounded to 2 significant figures so a pan doesn't re-render the drawer.
    const rounded = Number(heightM.toPrecision(2));
    setCameraHeightM((current) => (current === rounded ? current : rounded));
  }, []);

  const seedChat = useCallback((text: string) => {
    setChatSeed({ id: crypto.randomUUID(), text });
    setChatOpen(true);
  }, []);

  const clearSeed = useCallback(() => setChatSeed(null), []);

  const value = useMemo<MapStateContextValue>(
    () => ({
      layer,
      window: windowId,
      scale,
      mapStyle,
      setMapStyle,
      city3d,
      setCity3d,
      restrooms,
      eco,
      setRestrooms,
      setEco,
      tilted,
      walking,
      walkRequest,
      selectedNtaCode,
      selectedBlockKey,
      highlightedNtaCodes,
      cameraTarget,
      navCommand,
      cameraHeightM,
      chatSeed,
      chatOpen,
      caveatsOpen,
      detailsOpen,
      detailsExpanded,
      setLayer,
      setWindow,
      setScale,
      setTilted,
      startWalk,
      stopWalk,
      selectNta,
      selectBlock,
      setHighlights,
      flyTo,
      navigate,
      setCameraHeight,
      reportCameraHeight,
      seedChat,
      clearSeed,
      setChatOpen,
      setCaveatsOpen,
      setDetailsOpen,
      setDetailsExpanded,
      streetViewOpen,
      setStreetViewOpen,
    }),
    [
      layer,
      windowId,
      scale,
      mapStyle,
      setMapStyle,
      city3d,
      setCity3d,
      restrooms,
      eco,
      setRestrooms,
      setEco,
      tilted,
      walking,
      walkRequest,
      selectedNtaCode,
      selectedBlockKey,
      highlightedNtaCodes,
      cameraTarget,
      navCommand,
      cameraHeightM,
      chatSeed,
      chatOpen,
      caveatsOpen,
      detailsOpen,
      detailsExpanded,
      setLayer,
      setWindow,
      setScale,
      startWalk,
      stopWalk,
      selectNta,
      selectBlock,
      setHighlights,
      flyTo,
      navigate,
      setCameraHeight,
      reportCameraHeight,
      seedChat,
      clearSeed,
      setDetailsOpen,
      streetViewOpen,
    ],
  );

  return (
    <MapStateContext.Provider value={value}>
      {children}
    </MapStateContext.Provider>
  );
}

export function useMapState(): MapStateContextValue {
  const context = useContext(MapStateContext);
  if (!context) {
    throw new Error("useMapState must be used inside MapStateProvider");
  }
  return context;
}
