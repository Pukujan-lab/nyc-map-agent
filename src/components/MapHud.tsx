import { Compass, Minus, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlags } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { startSharing, stopSharing, useSharedLocation } from "@/lib/geo/sharedLocation";

interface MapHudProps {
  onOpenControls: () => void;
  onOpenSources: () => void;
  isDesktop: boolean;
  /** Set by the transit feature; the Follow item is hidden until then. */
  follow?: { active: boolean; onToggle: () => void };
}

/** iOS Safari has no element fullscreen; hide the item where it can't work. */
const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled === true;

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center rounded-full border border-border/70 bg-card/95 p-0.5 shadow-lg backdrop-blur-md">
      {children}
    </div>
  );
}

/** A text-labelled rail button. The only icon-only buttons are zoom and compass. */
function TextButton({
  active,
  primary,
  onClick,
  children,
  ...rest
}: {
  active?: boolean;
  primary?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active || primary ? "default" : "outline"}
      aria-pressed={active}
      className="pointer-events-auto h-9 justify-center rounded-full px-3.5 text-xs font-medium shadow-lg"
      onClick={onClick}
      {...rest}
    >
      {children}
    </Button>
  );
}

/**
 * The always-visible controls on the right: a small zoom / compass cluster,
 * then a few text buttons — Directions, Street view, Ask — and one More menu
 * for everything else. Layers live in the panel's chip row and its dropdowns.
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
  const flags = useFlags();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const directing = routePicking !== null || routeStart !== null;
  const shared = useSharedLocation();
  const { flyTo } = useMapState();
  // The browser permission prompt appears only from this tap.
  const locate = () => void startSharing().then((c) => { if (c) flyTo({ lon: c.lon, lat: c.lat, zoom: 16 }); });

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 z-20 flex flex-col items-end gap-2",
        isDesktop
          ? "top-3"
          : "top-[calc(env(safe-area-inset-top)+6.5rem)] max-h-[calc(100%-6.5rem-108px)] overflow-y-auto [scrollbar-width:none]",
      )}
    >
      <Group>
        {isDesktop ? (
          <>
            <Button type="button" size="icon" variant="ghost" aria-label="Zoom in" className="h-9 w-9 rounded-full" onClick={() => navigate("zoom-in")}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Zoom out" className="h-9 w-9 rounded-full" onClick={() => navigate("zoom-out")}>
              <Minus className="h-4 w-4" />
            </Button>
          </>
        ) : null}
        <Button type="button" size="icon" variant="ghost" aria-label="Face north and flatten the map" className="h-9 w-9 rounded-full" onClick={() => navigate("north")}>
          <Compass className="h-4 w-4" />
        </Button>
      </Group>

      {flags.directions ? (
        <TextButton primary active={directing} onClick={() => setRoutePicking(routeStart ? "end" : "start")}>
          Directions
        </TextButton>
      ) : null}
      {flags.streetLevel ? (
        <TextButton active={walking} onClick={() => (walking ? stopWalk() : startWalk())}>
          {walking ? "Leave street view" : "Street view"}
        </TextButton>
      ) : null}
      {shared.status === "on" ? (
        <TextButton active onClick={() => stopSharing()}>Stop sharing location</TextButton>
      ) : (
        <TextButton onClick={locate}>{shared.status === "asking" ? "Finding you…" : "My location"}</TextButton>
      )}
      <TextButton onClick={() => setChatOpen(true)}>Ask</TextButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="pointer-events-auto h-9 rounded-full px-3.5 text-xs font-medium shadow-lg">
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {follow ? (
            <DropdownMenuCheckboxItem checked={follow.active} onCheckedChange={follow.onToggle}>
              Follow vehicle
            </DropdownMenuCheckboxItem>
          ) : null}
          {flags.city3d ? (
            <DropdownMenuCheckboxItem checked={city3d} onCheckedChange={(on) => setCity3d(on === true)}>
              Textured 3D city
            </DropdownMenuCheckboxItem>
          ) : null}
          <DropdownMenuCheckboxItem checked={eco} onCheckedChange={(on) => setEco(on === true)}>
            Eco mode (save battery)
          </DropdownMenuCheckboxItem>
          {canFullscreen ? (
            <DropdownMenuItem
              onSelect={() => (fullscreen ? void document.exitFullscreen() : void document.documentElement.requestFullscreen())}
            >
              {fullscreen ? "Exit full screen" : "Full screen"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenControls}>Filters and settings…</DropdownMenuItem>
          {flags.dataLayers ? <DropdownMenuItem onSelect={onOpenSources}>Data layers…</DropdownMenuItem> : null}
          <DropdownMenuItem onSelect={() => setCaveatsOpen(true)}>About the data and credits</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
