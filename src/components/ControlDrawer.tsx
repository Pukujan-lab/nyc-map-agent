import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  LocateFixed,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCount } from "@/lib/format";
import type { AggregationProgress } from "@/lib/geo/types";
import {
  HOME_VIEW,
  MAP_SCALES,
  SCALE_LABELS,
  type MapScale,
} from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { windowBounds } from "@/lib/windows";
import { LayerToggle } from "./LayerToggle";
import { Legend } from "./Legend";
import { WindowSelect } from "./WindowSelect";

export interface NeighborhoodOption {
  code: string;
  name: string;
  count: number;
}

interface ControlDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: {
    noise: AggregationProgress | null;
    crashes: AggregationProgress | null;
  };
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  neighborhoods: NeighborhoodOption[];
  onRetry: () => void;
  /** Peak value on the current scale — the top of the height scale. */
  maxValue: number;
  /** Areas on the current scale with at least one record. */
  areasWithData: number;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function ScaleToggle() {
  const { scale, setScale, flyTo } = useMapState();

  const changeScale = (next: MapScale) => {
    if (next === scale) return;
    setScale(next);
    // Switching scale is a view change: frame the city so the chosen
    // granularity is actually visible.
    flyTo({
      lon: HOME_VIEW.lon,
      lat: HOME_VIEW.lat,
      zoom:
        next === "blocks"
          ? HOME_VIEW.blockZoom
          : HOME_VIEW.neighborhoodZoom,
    });
  };

  return (
    <div
      role="group"
      aria-label="Map scale"
      className="flex w-full rounded-lg border border-border/60 bg-muted/40 p-0.5"
    >
      {MAP_SCALES.map((id) => {
        const activeScale = id === scale;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={activeScale}
            onClick={() => changeScale(id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeScale
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SCALE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

export function ControlDrawer({
  open,
  onOpenChange,
  progress,
  isLoading,
  isError,
  errorMessage,
  neighborhoods,
  onRetry,
  maxValue,
  areasWithData,
}: ControlDrawerProps) {
  const {
    layer,
    window: windowId,
    scale,
    selectedNtaCode,
    selectNta,
    setDetailsExpanded,
    navigate,
    setCaveatsOpen,
  } = useMapState();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { shortLabel } = windowBounds(windowId);
  const active = progress.noise ?? progress.crashes;
  const percent =
    active && active.total > 0
      ? Math.min(100, Math.round((active.loaded / active.total) * 100))
      : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "left" : "bottom"}
        className="flex max-h-[85vh] flex-col overflow-y-auto p-0 sm:max-w-sm"
      >
        <SheetHeader>
          <SheetTitle>NYC Map Agent</SheetTitle>
          <SheetDescription>
            Noise and crashes, block by block.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <Section label="Layer">
            <LayerToggle />
          </Section>

          <Section label="Scale">
            <ScaleToggle />
          </Section>

          <Section label="Time window">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-muted-foreground">
                311 covers the selected window. Crash data always uses the
                newest 12 months.
              </p>
              <WindowSelect />
            </div>
          </Section>

          <Section label="Jump to a neighborhood">
            <Select
              value={selectedNtaCode ?? ""}
              onValueChange={(code) => {
                selectNta(code);
                // Chosen from a list, not tapped on the map — the numbers are
                // what was asked for, so open the full sheet straight away.
                setDetailsExpanded(true);
              }}
            >
              <SelectTrigger aria-label="Jump to a neighborhood">
                <SelectValue placeholder="Choose a neighborhood…" />
              </SelectTrigger>
              <SelectContent>
                {neighborhoods.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.name} · {formatCount(option.count)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          <Section label="View">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 flex-1"
                onClick={() => navigate("zoom-out")}
              >
                <ZoomOut className="h-3.5 w-3.5" />
                Out
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 flex-1"
                onClick={() => navigate("zoom-in")}
              >
                <ZoomIn className="h-3.5 w-3.5" />
                In
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 flex-1"
                onClick={() => navigate("reset")}
              >
                <LocateFixed className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </Section>

          <Legend
            layer={layer}
            scale={scale}
            maxValue={maxValue}
            areasWithData={areasWithData}
          />

          {isError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5">
              <div className="flex items-start gap-1.5 text-[11px] text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span>
                  {errorMessage ?? "Could not reach NYC Open Data."} The map
                  still works.
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-7 w-full text-[11px]"
                onClick={onRetry}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          ) : null}

          {isLoading && !isError ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
                <span>
                  {active?.phase === "counting"
                    ? `Counting ${shortLabel} of rows…`
                    : `Aggregating ${shortLabel}…`}
                </span>
                {active && active.total > 0 ? (
                  <span className="tabular-nums">
                    {formatCount(active.loaded)}/{formatCount(active.total)}
                  </span>
                ) : null}
              </div>
              <Progress
                value={active?.phase === "counting" ? 4 : percent}
                aria-label="Aggregation progress"
              />
            </div>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full justify-start text-[11px]"
            onClick={() => {
              onOpenChange(false);
              setCaveatsOpen(true);
            }}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Data caveats and sources
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
