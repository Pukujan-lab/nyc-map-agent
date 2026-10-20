import { LAYER_IDS, LAYER_LABELS } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";

export function LayerToggle() {
  const { layer, setLayer } = useMapState();

  return (
    <div
      role="group"
      aria-label="Map layer"
      className="flex w-full rounded-lg border border-border/60 bg-muted/40 p-0.5"
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
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LAYER_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
