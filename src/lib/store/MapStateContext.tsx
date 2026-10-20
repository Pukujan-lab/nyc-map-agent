import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { parseLayerId, parseMapScale, type LayerId, type MapScale } from "@/lib/layers";
import { parseWindowId, type WindowId } from "@/lib/windows";

export interface CameraTarget {
  lon: number;
  lat: number;
  zoom?: number;
  /** Omitted means "keep the tilt the user is already looking at". */
  pitch?: number;
  /** Bumped on every request so repeat flights to the same place still fire. */
  nonce: number;
}

export type NavCommandType = "zoom-in" | "zoom-out" | "reset";

export interface NavCommand {
  type: NavCommandType;
  nonce: number;
}

export interface ChatSeed {
  id: string;
  text: string;
}

interface MapState {
  layer: LayerId;
  window: WindowId;
  scale: MapScale;
  /** True while the camera is pitched; drives the "3D" toggle's pressed state. */
  tilted: boolean;
  selectedNtaCode: string | null;
  selectedBlockKey: string | null;
  highlightedNtaCodes: string[];
  cameraTarget: CameraTarget | null;
  navCommand: NavCommand | null;
  chatSeed: ChatSeed | null;
  chatOpen: boolean;
  caveatsOpen: boolean;
}

interface MapStateActions {
  setLayer: (layer: LayerId) => void;
  setWindow: (window: WindowId) => void;
  setScale: (scale: MapScale) => void;
  setTilted: (tilted: boolean) => void;
  selectNta: (ntaCode: string | null) => void;
  selectBlock: (block: { key: string; ntaCode: string } | null) => void;
  setHighlights: (ntaCodes: string[]) => void;
  flyTo: (target: Omit<CameraTarget, "nonce">) => void;
  navigate: (type: NavCommandType) => void;
  seedChat: (text: string) => void;
  clearSeed: () => void;
  setChatOpen: (open: boolean) => void;
  setCaveatsOpen: (open: boolean) => void;
}

type MapStateContextValue = MapState & MapStateActions;

const MapStateContext = createContext<MapStateContextValue | null>(null);

export function MapStateProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const layer = parseLayerId(searchParams.get("layer"));
  const windowId = parseWindowId(searchParams.get("window"));
  const scale = parseMapScale(searchParams.get("scale"));

  const [tilted, setTilted] = useState(false);
  const [selectedNtaCode, setSelectedNtaCode] = useState<string | null>(null);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [highlightedNtaCodes, setHighlighted] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [navCommand, setNavCommand] = useState<NavCommand | null>(null);
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [caveatsOpen, setCaveatsOpen] = useState(false);

  const updateSearch = useCallback(
    (key: "layer" | "window" | "scale", value: string) => {
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

  const selectNta = useCallback((ntaCode: string | null) => {
    setSelectedNtaCode(ntaCode);
    // Picking a neighborhood is a coarser selection, so drop any block.
    setSelectedBlockKey(null);
  }, []);

  const selectBlock = useCallback(
    (block: { key: string; ntaCode: string } | null) => {
      setSelectedBlockKey(block ? block.key : null);
      if (block) setSelectedNtaCode(block.ntaCode);
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
      tilted,
      selectedNtaCode,
      selectedBlockKey,
      highlightedNtaCodes,
      cameraTarget,
      navCommand,
      chatSeed,
      chatOpen,
      caveatsOpen,
      setLayer,
      setWindow,
      setScale,
      setTilted,
      selectNta,
      selectBlock,
      setHighlights,
      flyTo,
      navigate,
      seedChat,
      clearSeed,
      setChatOpen,
      setCaveatsOpen,
    }),
    [
      layer,
      windowId,
      scale,
      tilted,
      selectedNtaCode,
      selectedBlockKey,
      highlightedNtaCodes,
      cameraTarget,
      navCommand,
      chatSeed,
      chatOpen,
      caveatsOpen,
      setLayer,
      setWindow,
      setScale,
      selectNta,
      selectBlock,
      setHighlights,
      flyTo,
      navigate,
      seedChat,
      clearSeed,
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
