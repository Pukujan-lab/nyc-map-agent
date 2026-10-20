import {
  Box,
  Camera,
  MessageSquare,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useMapState } from "@/lib/store/MapStateContext";
import { LayerToggle } from "./LayerToggle";

interface MapHudProps {
  onOpenControls: () => void;
}

/**
 * The whole always-visible UI: one dock. Everything that is set once — time
 * window, scale, neighborhood jump, zoom, the map key, caveats — lives in the
 * control drawer so the map is what fills the screen.
 */
export function MapHud({ onOpenControls }: MapHudProps) {
  const {
    tilted,
    setTilted,
    walking,
    startWalk,
    stopWalk,
    setChatOpen,
  } = useMapState();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1 shadow-xl backdrop-blur-md">
        <LayerToggle compact />

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* The tilt is the overhead view's business. Street level is already
            pitched to the ceiling, so the button would only be able to undo it. */}
        {walking ? null : (
          <Button
            type="button"
            size="icon"
            variant={tilted ? "default" : "ghost"}
            aria-label={
              tilted ? "Flatten the map to north-up" : "Tilt the map into 3D"
            }
            aria-pressed={tilted}
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={() => setTilted(!tilted)}
          >
            {tilted ? (
              <Square className="h-4 w-4" />
            ) : (
              <Box className="h-4 w-4" />
            )}
          </Button>
        )}

        {/*
          The headline control: one press puts the camera at eye level and hands
          you the city to walk through. Named, not an icon alone — a camera icon
          with no label was invisible to anyone who did not guess at it.
        */}
        <Button
          type="button"
          size="sm"
          variant={walking ? "default" : "ghost"}
          aria-label={
            walking
              ? "Leave street level and return to the overhead map"
              : "Switch to the street-level camera and walk the city"
          }
          aria-pressed={walking}
          className="h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-[11px] font-medium"
          onClick={() => (walking ? stopWalk() : startWalk())}
        >
          <Camera className="h-4 w-4" />
          Street
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Map settings"
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={onOpenControls}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Ask the map"
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={() => setChatOpen(true)}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
