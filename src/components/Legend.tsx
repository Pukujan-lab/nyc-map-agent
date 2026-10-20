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
        className={`h-0 w-4 shrink-0 border-t ${className}`}
      />
      <span className="flex-1 text-[11px]">{label}</span>
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
  const { window: windowId, setCaveatsOpen } = useMapState();
  const { shortLabel } = windowBounds(windowId);

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

      <p className="mt-2 text-[11px] leading-snug">
        Taller = more. Every area is drawn as see-through glass, so the streets
        stay readable underneath and no colour is doing any of the work.
      </p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        Height = {view ? view.unit : LAYER_METRICS[layer].value} · peak{" "}
        {formatCount(maxValue)} · {formatCount(areasWithData)}{" "}
        {scale === "blocks" ? "~300 m blocks" : "neighborhoods"} with records
      </p>

      {view ? (
        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {view.kind === "average" ? "Sources in this average" : "Source"}
          </div>
          {view.contributors.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Still loading — or no sources ticked.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {view.contributors.map((id) => (
                <li key={id} className="text-[11px]">
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
              Each source is turned into a 0–100 percentile rank per area, then
              the ranks are averaged.
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-2.5 space-y-1 border-t border-border/60 pt-2">
        {scale === "blocks" ? (
          <LineKey
            className="border-slate-500/50"
            label="~300 m block square"
          />
        ) : null}
        <LineKey
          className="border-slate-700/60"
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
