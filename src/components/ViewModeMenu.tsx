import { ChevronDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
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
import { cn } from "@/lib/utils";

/**
 * One dropdown for "what is the map showing": the classic noise / crashes /
 * both layers, any single enabled registry source, or the Average composite.
 */
export function ViewModeMenu({
  compact = false,
  onOpenSources,
}: {
  compact?: boolean;
  onOpenSources?: () => void;
}) {
  const { layer, setLayer } = useMapState();
  const { viewMode, setViewMode, enabledSources, averageSources } = useDataView();

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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
            Classic layers
          </DropdownMenuLabel>
          {LAYER_IDS.map((id) => (
            <DropdownMenuRadioItem key={id} value={`legacy:${id}`}>
              {id === "combined" ? "Noise + crashes" : LAYER_LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
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
        </DropdownMenuRadioGroup>
        {onOpenSources ? (
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
