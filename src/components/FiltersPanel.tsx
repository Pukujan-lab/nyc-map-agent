import { useQuery } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOROUGHS, DATA_BACKEND, fetchSourceMeta } from "@/lib/datasets/backend";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import { useFilters } from "@/lib/datasets/useFilters";
import { formatCount } from "@/lib/format";

const ALL = "__all__";

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A dropdown of checkboxes: the shadcn pattern for multi-select, no custom widget. */
function MultiPick({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; n: number }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full justify-between text-xs font-normal">
          <span className="truncate">
            {label}: {selected.length ? `${selected.length} selected` : "all"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            className="text-xs"
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(on ? [...selected, o.value] : selected.filter((v) => v !== o.value))
            }
          >
            <span className="flex-1 truncate">{o.value}</span>
            <span className="ml-2 tabular-nums text-muted-foreground">{formatCount(o.n)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Borough, category and severity filters, driven by /api/sources metadata. */
export function FiltersPanel({ enabledSources }: { enabledSources: string[] }) {
  const { filters, setBorough, setCategories, setSeverity, clear, activeCount } = useFilters();
  const octo = DATA_BACKEND === "octo";
  const meta = useQuery({
    queryKey: ["source-meta"],
    queryFn: ({ signal }) => fetchSourceMeta(signal),
    enabled: octo,
    staleTime: 30 * 60 * 1000,
  });

  if (!octo) {
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        Filters by borough, complaint type and crash severity work when the map reads
        from the Octo data layer. This build queries NYC Open Data directly.
      </p>
    );
  }

  const withCategories = enabledSources.filter((id) => SOURCE_BY_ID[id]?.filters?.categories);
  const withSeverity = enabledSources.filter((id) => SOURCE_BY_ID[id]?.filters?.severity);

  return (
    <div className="space-y-2">
      <Select value={filters.borough ?? ALL} onValueChange={(v) => setBorough(v === ALL ? undefined : v)}>
        <SelectTrigger aria-label="Borough" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All boroughs</SelectItem>
          {BOROUGHS.map((b) => (
            <SelectItem key={b} value={b}>
              {titleCase(b)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {withCategories.map((id) => (
        <MultiPick
          key={id}
          label={SOURCE_BY_ID[id].shortLabel}
          options={meta.data?.[id]?.categories ?? []}
          selected={filters.categories[id] ?? []}
          onChange={(values) => setCategories(id, values)}
        />
      ))}
      {withSeverity.map((id) => (
        <MultiPick
          key={id}
          label={`${SOURCE_BY_ID[id].shortLabel} severity`}
          options={meta.data?.[id]?.severities ?? []}
          selected={filters.severity}
          onChange={setSeverity}
        />
      ))}
      {meta.error ? <p className="text-[11px] text-destructive">Could not load filter options.</p> : null}
      {activeCount ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={clear}>
          <X className="h-3 w-3" /> Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
        </Button>
      ) : null}
    </div>
  );
}
