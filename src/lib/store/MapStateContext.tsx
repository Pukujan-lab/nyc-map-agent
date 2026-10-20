import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { parseLayerId, type LayerId } from "@/lib/layers";
import { parseWindowId, type WindowId } from "@/lib/windows";

export interface CameraTarget {
  lon: number;
  lat: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  /** Bumped on every request so repeat flights to the same place still fire. */
  nonce: number;
}

export interface ChatSeed {
  id: string;
  text: string;
}

interface MapState {
  layer: LayerId;
  window: WindowId;
  selectedNtaCode: string | null;
  highlightedNtaCodes: string[];
  cameraTarget: CameraTarget | null;
  chatSeed: ChatSeed | null;
  chatOpen: boolean;
  caveatsOpen: boolean;
}

interface MapStateActions {
  setLayer: (layer: LayerId) => void;
  setWindow: (window: WindowId) => void;
  selectNta: (ntaCode: string | null) => void;
  setHighlights: (ntaCodes: string[]) => void;
  flyTo: (target: Omit<CameraTarget, "nonce">) => void;
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

  const [selectedNtaCode, setSelectedNtaCode] = useState<string | null>(null);
  const [highlightedNtaCodes, setHighlighted] = useState<string[]>([]);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [caveatsOpen, setCaveatsOpen] = useState(false);

  const updateSearch = useCallback(
    (key: "layer" | "window", value: string) => {
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

  const selectNta = useCallback((ntaCode: string | null) => {
    setSelectedNtaCode(ntaCode);
  }, []);

  const setHighlights = useCallback((ntaCodes: string[]) => {
    setHighlighted(Array.from(new Set(ntaCodes)));
  }, []);

  const flyTo = useCallback((target: Omit<CameraTarget, "nonce">) => {
    setCameraTarget({ ...target, nonce: Date.now() });
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
      selectedNtaCode,
      highlightedNtaCodes,
      cameraTarget,
      chatSeed,
      chatOpen,
      caveatsOpen,
      setLayer,
      setWindow,
      selectNta,
      setHighlights,
      flyTo,
      seedChat,
      clearSeed,
      setChatOpen,
      setCaveatsOpen,
    }),
    [
      layer,
      windowId,
      selectedNtaCode,
      highlightedNtaCodes,
      cameraTarget,
      chatSeed,
      chatOpen,
      caveatsOpen,
      setLayer,
      setWindow,
      selectNta,
      setHighlights,
      flyTo,
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
