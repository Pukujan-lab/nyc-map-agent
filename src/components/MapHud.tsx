import {
  Box,
  Footprints,
  MessageSquare,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { Bucket } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { LayerToggle } from "./LayerToggle";
import { LegendContent } from "./Legend";

interface MapHudProps {
  buckets: Bucket[];
  maxValue: number;
  onOpenControls: () => void;
}

/**
 * The whole always-visible UI: one dock. Everything that is set once — time
 * window, scale, neighborhood jump, zoom, caveats — lives in the control
 * drawer so the map is what fills the screen.
 */
export function MapHud({ buckets, maxValue, onOpenControls }: MapHudProps) {
  const {
    layer,
    scale,
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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Legend and color ranges"
              className="h-8 shrink-0 gap-1.5 rounded-full px-2 text-[11px]"
            >
              <span className="flex items-center gap-0.5" aria-hidden="true">
                {buckets.map((bucket) => (
                  <span
                    key={bucket.index}
                    className="h-3 w-1.5 rounded-[1px]"
                    style={{ backgroundColor: bucket.hex }}
                  />
                ))}
              </span>
              <span className="hidden sm:inline">Legend</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-[260px]">
            <LegendContent
              layer={layer}
              scale={scale}
              buckets={buckets}
              maxValue={maxValue}
            />
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        <LayerToggle compact />

        <Button
          type="button"
          size="icon"
          variant={tilted ? "default" : "ghost"}
          aria-label={
            tilted ? "Flatten the map to north-up" : "Tilt the map into 3D"
          }
          aria-pressed={tilted}
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={() => {
            if (walking) stopWalk();
            setTilted(!tilted);
          }}
        >
          {tilted ? (
            <Square className="h-4 w-4" />
          ) : (
            <Box className="h-4 w-4" />
          )}
        </Button>

        <Button
          type="button"
          size="icon"
          variant={walking ? "default" : "ghost"}
          aria-label={walking ? "Stop walking the map" : "Walk the map"}
          aria-pressed={walking}
          className="h-8 w-8 shrink-0 rounded-full"
          onClick={() => (walking ? stopWalk() : startWalk())}
        >
          <Footprints className="h-4 w-4" />
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
