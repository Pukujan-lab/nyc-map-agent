import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { LAYER_METRICS, rampHex, type LayerId } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { windowBounds } from "@/lib/windows";

interface LegendProps {
  layer: LayerId;
  maxHeightValue: number;
}

export function Legend({ layer, maxHeightValue }: LegendProps) {
  const { window: windowId, setCaveatsOpen } = useMapState();
  const { shortLabel } = windowBounds(windowId);
  const ramp = rampHex(layer);

  return (
    <Card className="w-[240px] p-3 sm:w-[260px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Legend
      </div>

      <div className="mt-2 space-y-2.5">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-medium">Height</span>
            <span className="truncate text-muted-foreground">
              {LAYER_METRICS[layer].height}
            </span>
          </div>
          <div className="mt-1.5 flex items-end gap-1" aria-hidden="true">
            {[0.22, 0.42, 0.66, 1].map((scale) => (
              <div
                key={scale}
                className="w-3 rounded-t-sm bg-primary/80"
                style={{ height: `${Math.round(scale * 22)}px` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>0</span>
            <span>{formatCount(maxHeightValue)} max</span>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-medium">Color</span>
            <span className="truncate text-muted-foreground">
              {LAYER_METRICS[layer].color}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${ramp.from}, ${ramp.to})`,
            }}
            aria-hidden="true"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>low</span>
            <span>high</span>
          </div>
        </div>
      </div>

      {layer === "combined" ? (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Noise covers the last {shortLabel}; crashes cover the newest 12
          months, because that dataset lags.
        </p>
      ) : null}

      <p className="mt-2.5 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
        311 counts are <em>reported</em> complaints, not measured noise. Crash
        data lags ~4 months.{" "}
        <button
          type="button"
          onClick={() => setCaveatsOpen(true)}
          className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Details
        </button>
      </p>
    </Card>
  );
}
