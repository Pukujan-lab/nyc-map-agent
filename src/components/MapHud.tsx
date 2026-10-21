import {
  BatteryLow,
  Building2,
  Camera,
  Compass,
  Info,
  Maximize,
  MessageSquare,
  Minimize,
  Minus,
  Navigation,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";
import { ViewModeMenu } from "./ViewModeMenu";

interface MapHudProps {
  onOpenControls: () => void;
  onOpenSources: () => void;
  isDesktop: boolean;
  /** Set by the transit feature; the Follow button is hidden until then. */
  follow?: { active: boolean; onToggle: () => void };
}

/** iOS Safari has no element fullscreen; hide the button where it can't work. */
const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled === true;

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center rounded-full border border-border/70 bg-card/95 p-0.5 shadow-lg backdrop-blur-md">
      {children}
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "default" : "ghost"}
      aria-label={label}
      aria-pressed={active}
      className="h-9 w-9 rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The always-visible controls: a slim vertical rail on the right (Mini Tokyo
 * 3D style), grouped pills of icon-only buttons. Desktop and mobile share it;
 * on mobile it is compact and sits above the sheet's peek.
 */
export function MapHud({ onOpenControls, onOpenSources, isDesktop, follow }: MapHudProps) {
  const { routePicking, routeStart, setRoutePicking } = useDataView();
  const {
    walking,
    startWalk,
    stopWalk,
    navigate,
    city3d,
    setCity3d,
    eco,
    setEco,
    setChatOpen,
    setCaveatsOpen,
  } = useMapState();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 z-20 flex flex-col gap-2",
        isDesktop
          ? "top-3"
          : "top-[calc(env(safe-area-inset-top)+6.5rem)] max-h-[calc(100%-6.5rem-108px)] overflow-y-auto [scrollbar-width:none]",
      )}
    >
      <Group>
        {isDesktop ? (
          <>
            <RailButton label="Zoom in" onClick={() => navigate("zoom-in")}>
              <Plus className="h-4 w-4" />
            </RailButton>
            <RailButton label="Zoom out" onClick={() => navigate("zoom-out")}>
              <Minus className="h-4 w-4" />
            </RailButton>
          </>
        ) : null}
        <RailButton label="Face north and flatten the map" onClick={() => navigate("north")}>
          <Compass className="h-4 w-4" />
        </RailButton>
      </Group>

      {canFullscreen ? (
        <Group>
          <RailButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() =>
              fullscreen
                ? void document.exitFullscreen()
                : void document.documentElement.requestFullscreen()
            }
          >
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </RailButton>
        </Group>
      ) : null}

      <Group>
        <RailButton label="Textured 3D city" active={city3d} onClick={() => setCity3d(!city3d)}>
          <Building2 className="h-4 w-4" />
        </RailButton>
        <RailButton
          label={walking ? "Leave street level" : "Street level"}
          active={walking}
          onClick={() => (walking ? stopWalk() : startWalk())}
        >
          <Camera className="h-4 w-4" />
        </RailButton>
        {follow ? (
          <RailButton label="Follow" active={follow.active} onClick={follow.onToggle}>
            <Navigation className="h-4 w-4 rotate-45" />
          </RailButton>
        ) : null}
        <RailButton label="Eco mode" active={eco} onClick={() => setEco(!eco)}>
          <BatteryLow className="h-4 w-4" />
        </RailButton>
      </Group>

      <Group>
        <ViewModeMenu iconOnly onOpenSources={onOpenSources} />
        <RailButton
          label="Walking directions"
          active={routePicking !== null || routeStart !== null}
          onClick={() => setRoutePicking(routeStart ? "end" : "start")}
        >
          <Navigation className="h-4 w-4" />
        </RailButton>
        <RailButton label="Filters and map settings" onClick={onOpenControls}>
          <SlidersHorizontal className="h-4 w-4" />
        </RailButton>
        <RailButton label="Ask the map" onClick={() => setChatOpen(true)}>
          <MessageSquare className="h-4 w-4" />
        </RailButton>
      </Group>

      <Group>
        <RailButton label="About the data and credits" onClick={() => setCaveatsOpen(true)}>
          <Info className="h-4 w-4" />
        </RailButton>
      </Group>
    </div>
  );
}
