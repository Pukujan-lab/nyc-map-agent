import {
  LAYER_IDS,
  LAYER_LABELS,
  LAYER_SHORT_LABELS,
} from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";

/**
 * The layer switch. Full width inside the control drawer; `compact` trims it to
 * a pill that fits in the HUD dock without wrapping.
 */
export function LayerToggle({ compact = false }: { compact?: boolean }) {
  const { layer, setLayer } = useMapState();
  const labels = compact ? LAYER_SHORT_LABELS : LAYER_LABELS;

  return (
    <div
      role="group"
      aria-label="Map layer"
      className={cn(
        "flex rounded-lg border border-border/60 bg-muted/40 p-0.5",
        compact ? "w-auto" : "w-full",
      )}
    >
      {LAYER_IDS.map((id) => {
        const active = id === layer;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => setLayer(id)}
            className={cn(
              "rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "px-2 py-1 text-[11px]" : "flex-1 px-2 py-1 text-xs",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[id]}
          </button>
        );
      })}
    </div>
  );
}
