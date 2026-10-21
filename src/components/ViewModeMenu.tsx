import { useEffect } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import { DEFAULT_VIEW } from "@/lib/datasets/view";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlags } from "@/lib/flags";
import { FEATURES } from "@/features";
import { cn } from "@/lib/utils";
import type { PanelChip } from "@/lib/store/PanelContext";

/**
 * One dropdown for "what is the map showing", driven by the registry: each
 * enabled source once, then the Concern score (average of the chosen ones).
 */
export function ViewModeMenu({
  compact = false,
  iconOnly = false,
  chip = false,
  toggles = [],
  onOpenSources,
}: {
  /** A chip at the end of the panel's chip row, labelled "More layers". */
  chip?: boolean;
  /** Secondary on/off layers (Schools, Traffic, Parking…) listed first. */
  toggles?: PanelChip[];
  compact?: boolean;
  /** A round icon button (the control rail); the menu is unchanged. */
  iconOnly?: boolean;
  onOpenSources?: () => void;
}) {
  const { city3d, setCity3d, restrooms, setRestrooms } = useMapState();
  const { viewMode, setViewMode, enabledSources, averageSources } = useDataView();
  const flags = useFlags();
  // Simple mode (advancedMode off) hides the analytics layers: noise is basic,
  // crashes and every other registry source and the Concern score are advanced.
  const allowed = (id: string) =>
    id === "noise" ? flags.noise : id === "crashes" ? flags.crashes : flags.dataLayers;
  const sources = enabledSources.filter(allowed);
  const showAverage = flags.dataLayers;
  const hidden = viewMode.kind === "source" ? !allowed(viewMode.sourceId) : !showAverage;
  // Simple mode has no data layers at all; writing a view there would put
  // `view=` in the URL and switch the analytics on through the link rule.
  const anyView = sources.length > 0 || showAverage;
  useEffect(() => {
    if (hidden && anyView) setViewMode(DEFAULT_VIEW);
  }, [hidden, anyView, setViewMode]);

  const value = viewMode.kind === "source" ? `src:${viewMode.sourceId}` : "avg";

  const label =
    viewMode.kind === "source"
      ? (SOURCE_BY_ID[viewMode.sourceId]?.shortLabel ?? "Source")
      : compact
        ? `Concern (${averageSources.length})`
        : `Concern score (${averageSources.length})`;

  const onChange = (next: string) => {
    if (next.startsWith("src:")) setViewMode({ kind: "source", sourceId: next.slice(4) });
    else setViewMode({ kind: "average", sourceIds: averageSources });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {chip ? (
          <button
            type="button"
            className="flex h-7 shrink-0 snap-start items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            More layers
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        ) : iconOnly ? (
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
      <DropdownMenuContent align={iconOnly || chip ? "end" : "center"} side={iconOnly ? "left" : undefined} className="w-64">
        {toggles.map((t) => (
          <DropdownMenuCheckboxItem key={t.id} checked={t.active} onCheckedChange={() => t.onToggle()}>
            {t.label}
          </DropdownMenuCheckboxItem>
        ))}
        {toggles.length && (sources.length || showAverage) ? <DropdownMenuSeparator /> : null}
        {sources.length || showAverage ? (
          <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">Data layers</div>
        ) : null}
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {sources.map((id) => (
            <DropdownMenuRadioItem key={id} value={`src:${id}`}>
              {SOURCE_BY_ID[id]?.label ?? id}
            </DropdownMenuRadioItem>
          ))}
          {showAverage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="avg" disabled={averageSources.length === 0}>
                Concern score (average of {averageSources.length})
              </DropdownMenuRadioItem>
            </>
          ) : null}
        </DropdownMenuRadioGroup>
        {FEATURES.map((f) => (f.LayersMenu ? <f.LayersMenu key={f.id} /> : null))}
        <DropdownMenuSeparator />
        {flags.city3d ? (
        <DropdownMenuCheckboxItem checked={city3d} onCheckedChange={(on) => setCity3d(on === true)}>
          Textured 3D city
        </DropdownMenuCheckboxItem>
        ) : null}
        {flags.restrooms && !chip ? (
        <DropdownMenuCheckboxItem checked={restrooms} onCheckedChange={(on) => setRestrooms(on === true)}>
          Public restrooms
        </DropdownMenuCheckboxItem>
        ) : null}
        {onOpenSources && flags.dataLayers ? (
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
