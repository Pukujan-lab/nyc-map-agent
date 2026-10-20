import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import {
  LAYER_METRICS,
  formatBucketRange,
  type Bucket,
  type LayerId,
  type MapScale,
} from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { windowBounds } from "@/lib/windows";

interface LegendProps {
  layer: LayerId;
  scale: MapScale;
  buckets: Bucket[];
  maxValue: number;
}

export function Legend({ layer, scale, buckets, maxValue }: LegendProps) {
  const { window: windowId, setCaveatsOpen } = useMapState();
  const { shortLabel } = windowBounds(windowId);
  const areasWithData = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <Card className="w-[240px] p-3 sm:w-[260px]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Legend
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {LAYER_METRICS[layer].value}
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {buckets.map((bucket) => (
          <li key={bucket.index} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: bucket.hex }}
            />
            <span className="flex-1 text-[11px] tabular-nums">
              {formatBucketRange(bucket)}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {formatCount(bucket.count)}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-sm bg-muted-foreground/25"
          />
          <span className="flex-1 text-[11px]">no records</span>
        </li>
      </ul>

      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        {scale === "blocks"
          ? `~300 m blocks · ${formatCount(areasWithData)} with records · peak ${formatCount(maxValue)}`
          : `Neighborhoods · ${formatCount(areasWithData)} with records · peak ${formatCount(maxValue)}`}
      </p>

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
