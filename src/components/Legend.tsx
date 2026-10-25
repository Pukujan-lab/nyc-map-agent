import { SCALE_LABELS } from "@/lib/layers";
import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import {
  LAYER_METRICS,
  type LayerId,
  type MapScale,
  type ViewInfo,
} from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { windowBounds } from "@/lib/windows";
import { USE_BLOCK_TILES } from "@/lib/map/blockTiles";
import { useFlag } from "@/lib/flags";

interface LegendProps {
  layer: LayerId;
  scale: MapScale;
  maxValue: number;
  areasWithData: number;
  /** Set under a single-source or Average view. */
  view?: ViewInfo;
}

function LineKey({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-0 w-6 shrink-0 border-t-[3px] ${className}`}
      />
      <span className="flex-1 text-[11px] font-semibold text-foreground">{label}</span>
    </li>
  );
}

/**
 * The map key. There is no colour ramp any more: areas are one translucent
 * glass hue and only their *height* encodes the count, so the key explains the
 * height scale and the three boundary lines instead of a set of colour bands.
 */
export function LegendContent({
  layer,
  scale,
  maxValue,
  areasWithData,
  view,
}: LegendProps) {
  const { window: windowId, setCaveatsOpen, mapStyle } = useMapState();
  const { shortLabel } = windowBounds(windowId);
  const blockDensity = useFlag("blockDensity");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Map key
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {view ? view.label : LAYER_METRICS[layer].value}
        </div>
      </div>

      {mapStyle === "columns" ? (
        <p className="mt-2 text-[11px] leading-snug">
          Taller = more. Every area is drawn as see-through glass, so the streets
          stay readable underneath.
        </p>
      ) : mapStyle === "heat" ? (
        <p className="mt-2 text-[11px] leading-snug">
          Brighter = more records nearby. The heatmap blends blocks, so use it for
          hot spots, not exact counts.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {/* Same stops as CHOROPLETH_RAMP in src/lib/map/style.ts (ColorBrewer YlOrRd). */}
          <div className="h-3 rounded-full ring-1 ring-border bg-[linear-gradient(to_right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)]" />
          <div className="flex justify-between text-[11px] font-semibold text-foreground">
            <span>fewer</span>
            <span>more</span>
          </div>
        </div>
      )}
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        {view ? view.unit : LAYER_METRICS[layer].value} · peak {formatCount(maxValue)} ·{" "}
        {formatCount(areasWithData)} {SCALE_LABELS[scale].toLowerCase()} areas with records
      </p>

      {view ? (
        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {view.kind === "average" ? "Concern score: sources" : "Source"}
          </div>
          {view.contributors.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Still loading — or no sources ticked.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {view.contributors.map((id) => (
                <li key={id} className="text-[11px]">
                  {view.kind === "average" ? (
                    <span aria-hidden="true" className="mr-1 text-muted-foreground">
                      {view.better?.includes(id) ? "↓" : "↑"}
                    </span>
                  ) : null}
                  {SOURCE_BY_ID[id]?.label ?? id}{" "}
                  <span className="font-mono text-muted-foreground">
                    {SOURCE_BY_ID[id]?.datasetId}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {view.kind === "average" ? (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              Higher = more concern. Each source becomes a 0–100 percentile
              rank per area; ↑ sources (higher is worse) count as is, ↓ sources
              (higher is better) count as 100 − percentile; then they are
              averaged.
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-2.5 space-y-1 border-t border-border/60 pt-2">
        {scale === "blocks" ? (
          <LineKey
            className="border-slate-500"
            label={USE_BLOCK_TILES ? "Tax block (DCP MapPLUTO)" : "~300 m block square"}
          />
        ) : null}
        {scale === "blocks" && USE_BLOCK_TILES && blockDensity ? (
          <li className="text-[11px] text-muted-foreground">
            Shaded per hectare, so big blocks and parks don&apos;t dominate. Parks only count points inside them.
          </li>
        ) : null}
        <LineKey
          className="border-slate-700"
          label="Neighborhood boundary"
        />
        <LineKey className="border-slate-900" label="Borough boundary" />
      </ul>

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Areas with no records have no height, so they simply are not drawn.
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
    </div>
  );
}

export function Legend(props: LegendProps) {
  return (
    <Card className="p-3">
      <LegendContent {...props} />
    </Card>
  );
}
