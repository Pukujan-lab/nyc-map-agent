import { useEffect } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import { LAYER_IDS, LAYER_LABELS, LAYER_SHORT_LABELS } from "@/lib/layers";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlags } from "@/lib/flags";
import { FEATURES } from "@/features";
import { cn } from "@/lib/utils";

/**
 * One dropdown for "what is the map showing": the classic noise / crashes /
 * both layers, any single enabled registry source, or the Average composite.
 */
export function ViewModeMenu({
  compact = false,
  iconOnly = false,
  onOpenSources,
}: {
  compact?: boolean;
  /** A round icon button (the control rail); the menu is unchanged. */
  iconOnly?: boolean;
  onOpenSources?: () => void;
}) {
  const { layer, setLayer, city3d, setCity3d, restrooms, setRestrooms } = useMapState();
  const { viewMode, setViewMode, enabledSources, averageSources } = useDataView();
  const flags = useFlags();
  // Simple mode (advancedMode off) hides the analytics layers; advanced adds
  // them back into this same dropdown without changing the layout.
  const layerIds = LAYER_IDS.filter((id) => flags[id]);
  const showData = flags.dataLayers;
  const hidden =
    (viewMode.kind === "legacy" && !flags[layer]) || (viewMode.kind !== "legacy" && !showData);
  useEffect(() => {
    if (!hidden) return;
    setLayer("noise");
    setViewMode({ kind: "legacy" });
  }, [hidden, setLayer, setViewMode]);

  const value =
    viewMode.kind === "legacy"
      ? `legacy:${layer}`
      : viewMode.kind === "source"
        ? `src:${viewMode.sourceId}`
        : "avg";

  const label =
    viewMode.kind === "legacy"
      ? (compact ? LAYER_SHORT_LABELS : LAYER_LABELS)[layer]
      : viewMode.kind === "source"
        ? (SOURCE_BY_ID[viewMode.sourceId]?.shortLabel ?? "Source")
        : `Concern (${averageSources.length})`;

  const onChange = (next: string) => {
    if (next.startsWith("legacy:")) {
      setLayer(next.slice(7) as (typeof LAYER_IDS)[number]);
      setViewMode({ kind: "legacy" });
    } else if (next.startsWith("src:")) {
      setViewMode({ kind: "source", sourceId: next.slice(4) });
    } else {
      setViewMode({ kind: "average", sourceIds: averageSources });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Layers: ${label}`}
            className="h-9 w-9 rounded-full"
          >
            <Layers className="h-4 w-4" />
          </Button>
        ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Map view: ${label}. Change what the map shows`}
          className={cn(
            "justify-between gap-1.5",
            compact ? "h-8 max-w-[9.5rem] rounded-full px-2.5 text-[11px]" : "w-full",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={iconOnly ? "end" : "center"} side={iconOnly ? "left" : undefined} className="w-64">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
            Classic layers
          </DropdownMenuLabel>
          {layerIds.map((id) => (
            <DropdownMenuRadioItem key={id} value={`legacy:${id}`}>
              {id === "combined" ? "Noise + crashes" : LAYER_LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
          {showData ? (
            <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
            Single source
          </DropdownMenuLabel>
          {enabledSources.map((id) => (
            <DropdownMenuRadioItem key={id} value={`src:${id}`}>
              {SOURCE_BY_ID[id]?.label ?? id}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value="avg" disabled={averageSources.length === 0}>
            Concern score: average of {averageSources.length} source
            {averageSources.length === 1 ? "" : "s"}
          </DropdownMenuRadioItem>
            </>
          ) : null}
        </DropdownMenuRadioGroup>
        {FEATURES.map((f) => (f.LayersMenu ? <f.LayersMenu key={f.id} /> : null))}
        <DropdownMenuSeparator />
        {flags.city3d ? (
        <DropdownMenuCheckboxItem checked={city3d} onCheckedChange={(on) => setCity3d(on === true)}>
          Textured 3D city (Lower Manhattan + Brownstone Brooklyn, zoom in)
        </DropdownMenuCheckboxItem>
        ) : null}
        {flags.restrooms ? (
        <DropdownMenuCheckboxItem checked={restrooms} onCheckedChange={(on) => setRestrooms(on === true)}>
          Public restrooms
        </DropdownMenuCheckboxItem>
        ) : null}
        {onOpenSources && showData ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenSources}>
              Choose data sources…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
