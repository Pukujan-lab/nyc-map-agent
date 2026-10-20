import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/format";
import type { AggregationProgress } from "@/lib/geo/types";
import { useMapState } from "@/lib/store/MapStateContext";
import { windowBounds } from "@/lib/windows";
import { LayerToggle } from "./LayerToggle";
import { WindowSelect } from "./WindowSelect";

export interface NeighborhoodOption {
  code: string;
  name: string;
  count: number;
}

interface MapControlsProps {
  progress: {
    noise: AggregationProgress | null;
    crashes: AggregationProgress | null;
  };
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  neighborhoods: NeighborhoodOption[];
  onRetry: () => void;
}

export function MapControls({
  progress,
  isLoading,
  isError,
  errorMessage,
  neighborhoods,
  onRetry,
}: MapControlsProps) {
  const {
    window: windowId,
    selectedNtaCode,
    selectNta,
  } = useMapState();
  const { shortLabel } = windowBounds(windowId);
  const active = progress.noise ?? progress.crashes;
  const percent =
    active && active.total > 0
      ? Math.min(100, Math.round((active.loaded / active.total) * 100))
      : 0;

  return (
    <Card className="pointer-events-auto w-[268px] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold leading-tight">
            NYC Map Agent
          </h1>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Noise and crashes, neighborhood by neighborhood
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <LayerToggle />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Window
        </span>
        <WindowSelect />
      </div>

      <div className="mt-2">
        <Select
          value={selectedNtaCode ?? ""}
          onValueChange={(code) => selectNta(code)}
        >
          <SelectTrigger aria-label="Jump to a neighborhood">
            <SelectValue placeholder="Jump to a neighborhood…" />
          </SelectTrigger>
          <SelectContent>
            {neighborhoods.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.name} · {formatCount(option.count)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <div className="mt-2.5 rounded-md border border-destructive/50 bg-destructive/10 p-2">
          <div className="flex items-start gap-1.5 text-[11px] text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              {errorMessage ?? "Could not reach NYC Open Data."} The basemap
              still works.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1.5 h-7 w-full text-[11px]"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      ) : null}

      {isLoading && !isError ? (
        <div className="mt-2.5 space-y-1">
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
    </Card>
  );
}
