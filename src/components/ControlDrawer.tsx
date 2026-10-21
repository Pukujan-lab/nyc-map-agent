import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Database,
  LocateFixed,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdvancedMode } from "@/lib/flags";
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
  MAP_STYLE_LABELS,
  MAP_STYLES,
  SCALE_LABELS,
  SCALE_PLURALS,
  type MapScale,
  type MapStyleId,
} from "@/lib/layers";
import type { AreaDatum } from "@/lib/geo/areas";
import { useMapState } from "@/lib/store/MapStateContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { windowBounds } from "@/lib/windows";
import type { ViewInfo } from "@/lib/layers";
import { ViewModeMenu } from "./ViewModeMenu";
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
  view?: ViewInfo;
  areas: AreaDatum[];
  onOpenSources: () => void;
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

function UnitAndStyle() {
  const { scale, setScale, mapStyle, setMapStyle, flyTo } = useMapState();

  const changeScale = (next: MapScale) => {
    if (next === scale) return;
    setScale(next);
    // A unit change is a view change: frame the city so it is visible.
    flyTo({
      lon: HOME_VIEW.lon,
      lat: HOME_VIEW.lat,
      zoom: next === "blocks" ? HOME_VIEW.blockZoom : next === "boroughs" ? 10 : HOME_VIEW.neighborhoodZoom,
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select value={scale} onValueChange={(v) => changeScale(v as MapScale)}>
        <SelectTrigger aria-label="Map unit" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MAP_SCALES.map((id) => (
            <SelectItem key={id} value={id}>
              {SCALE_LABELS[id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mapStyle} onValueChange={(v) => setMapStyle(v as MapStyleId)}>
        <SelectTrigger aria-label="Map style" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MAP_STYLES.map((id) => (
            <SelectItem key={id} value={id}>
              {MAP_STYLE_LABELS[id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The highest areas at the chosen unit, so the map can be read as a list too. */
function TopAreas({ areas }: { areas: AreaDatum[] }) {
  const top = [...areas].filter((a) => a.value > 0).sort((x, y) => y.value - x.value).slice(0, 8);
  if (!top.length) return null;
  return (
    <ol className="space-y-0.5 text-[11px]">
      {top.map((a, i) => (
        <li key={a.code} className="flex items-baseline justify-between gap-2">
          <span className="truncate">
            <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>
            {a.name}
          </span>
          <span className="tabular-nums text-muted-foreground">{formatCount(Math.round(a.value))}</span>
        </li>
      ))}
    </ol>
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
  view,
  areas,
  onOpenSources,
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
  const [advancedMode, setAdvancedMode] = useAdvancedMode();
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="advanced-mode" className="text-sm">Advanced</Label>
            <Switch id="advanced-mode" checked={advancedMode} onCheckedChange={setAdvancedMode} />
          </div>

          <Section label="Map view">
            <ViewModeMenu onOpenSources={onOpenSources} />
            {advancedMode ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onOpenSources}
            >
              <Database className="h-3.5 w-3.5" />
              Data sources…
            </Button>
            ) : null}
          </Section>

          <Section label="Unit and style">
            <UnitAndStyle />
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

          <Section label={`Top ${SCALE_PLURALS[scale].toLowerCase()}`}>
            <TopAreas areas={areas} />
          </Section>

          <Legend
            layer={layer}
            scale={scale}
            maxValue={maxValue}
            areasWithData={areasWithData}
            view={view}
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
