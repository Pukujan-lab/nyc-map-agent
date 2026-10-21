import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { AggregationProgress } from "@/lib/geo/types";
import { windowBounds, type WindowId } from "@/lib/windows";

interface MapStatusChipProps {
  windowId: WindowId;
  progress: {
    noise: AggregationProgress | null;
    crashes: AggregationProgress | null;
  };
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  /** "line": a thin auto-hiding bar under the search bar (the loading state only). */
  variant?: "chip" | "line";
}

/**
 * The only thing that appears above the map while data loads: one small chip
 * that goes away on its own. Details live in the control drawer.
 */
export function MapStatusChip({
  windowId,
  progress,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  variant = "chip",
}: MapStatusChipProps) {
  const { shortLabel } = windowBounds(windowId);
  const active = progress.noise ?? progress.crashes;
  const percent =
    active && active.total > 0
      ? Math.min(100, Math.round((active.loaded / active.total) * 100))
      : 0;

  if (variant === "line") {
    if (isError || !isLoading) return null;
    return (
      <Progress
        value={active?.phase === "counting" ? 4 : percent}
        aria-label={`Loading ${shortLabel} of data`}
        className="pointer-events-none absolute inset-x-5 -bottom-1 h-0.5 bg-transparent"
      />
    );
  }

  if (isError) {
    return (
      <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+6.5rem)] z-20 lg:left-[calc(50%+190px)] lg:top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-[11px] text-foreground shadow-lg backdrop-blur-md">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="max-w-[46vw] truncate sm:max-w-none">
          {errorMessage ?? "Could not reach NYC Open Data."} The map still works.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 rounded-full px-2 text-[11px]"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  // Loading progress lives in the search bar's thin line; this chip is errors only.
  return null;
}
