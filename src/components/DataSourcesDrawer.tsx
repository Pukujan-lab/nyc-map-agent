import { AlertTriangle, ArrowDownUp, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { FiltersPanel } from "./FiltersPanel";
import type { SourceCounts } from "@/lib/datasets/fetchSource";
import { DATA_BACKEND } from "@/lib/datasets/backend";
import {
  datasetUrl,
  POLARITY_LABELS,
  SOURCE_CATEGORIES,
  SOURCES,
  UNWIRED_DATASETS,
} from "@/lib/datasets/registry";
import type { SourceStatus } from "@/lib/datasets/useSourceCounts";
import { formatCount } from "@/lib/format";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMediaQuery } from "@/lib/useMediaQuery";

const GUIDE_KEY = "nyc-map-guide-seen";

interface DataSourcesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: Record<string, SourceCounts | undefined>;
  status: Record<string, SourceStatus>;
}

/**
 * Every registry source, grouped by category: a switch loads it, a checkbox
 * puts it into the Average view.
 */
export function DataSourcesDrawer({ open, onOpenChange, counts, status }: DataSourcesDrawerProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [firstRun] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== "1";
    } catch {
      return false;
    }
  });
  const markGuideSeen = () => {
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      /* private mode: show the guide again next time */
    }
  };
  const {
    enabledSources,
    averageSources,
    setSourceEnabled,
    setInAverage,
    polarityOf,
    flippedSources,
    toggleFlip,
  } = useDataView();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "left" : "bottom"}
        className={isDesktop ? "w-[380px] overflow-y-auto" : "max-h-[85vh] overflow-y-auto"}
      >
        <SheetHeader>
          <SheetTitle>Data sources</SheetTitle>
          <SheetDescription>
            {DATA_BACKEND === "octo" ? "NYC Open Data, loaded nightly into our data layer." : "NYC Open Data, queried live from your browser."} Switch a source on to
            load it; tick “in average” to include it in the Average view.
          </SheetDescription>
        </SheetHeader>

        <Accordion
          type="multiple"
          defaultValue={firstRun ? ["guide", ...SOURCE_CATEGORIES] : [...SOURCE_CATEGORIES]}
          className="mt-3"
          onValueChange={(v) => {
            if (!v.includes("guide")) markGuideSeen();
          }}
        >
          <AccordionItem value="guide">
            <AccordionTrigger className="py-2.5 text-xs uppercase tracking-wide">
              How to read this map
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5 text-[11px] leading-snug text-muted-foreground">
              <p>1. Switch on the sources you care about below. Each one says what a record is and what to watch out for.</p>
              <p>2. Pick a unit (block, neighborhood, community district, borough) and a style in the main menu.</p>
              <p>3. Darker areas have more records. Under the Average view, darker means more concern across your sources.</p>
              <p>4. Tap any area for its numbers. Counts are reports, not measurements, so compare like with like.</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="filters">
            <AccordionTrigger className="py-2.5 text-xs uppercase tracking-wide">
              Filters
            </AccordionTrigger>
            <AccordionContent>
              <FiltersPanel enabledSources={enabledSources} />
            </AccordionContent>
          </AccordionItem>
          {SOURCE_CATEGORIES.map((category) => (
            <AccordionItem key={category} value={category}>
              <AccordionTrigger className="py-2.5 text-xs uppercase tracking-wide">
                {category}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                {SOURCES.filter((source) => source.category === category).map((source) => {
                  const on = enabledSources.includes(source.id);
                  const st = status[source.id];
                  const data = counts[source.id];
                  return (
                    <div key={source.id} className="rounded-md border border-border/60 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Label htmlFor={`src-${source.id}`} className="text-[13px] font-medium">
                            {source.label}
                          </Label>
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {source.description}
                          </p>
                          <Collapsible className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            <CollapsibleTrigger className="text-foreground/80 underline-offset-2 hover:underline">About this source</CollapsibleTrigger>
                            <CollapsibleContent>
                            <dl className="mt-1 space-y-0.5">
                              <div><dt className="inline font-medium text-foreground">What: </dt><dd className="inline">{source.guide.what}</dd></div>
                              <div><dt className="inline font-medium text-foreground">Watch out: </dt><dd className="inline">{source.guide.caveats}</dd></div>
                              <div><dt className="inline font-medium text-foreground">Updated: </dt><dd className="inline">{source.guide.cadence}</dd></div>
                            </dl>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                        <Switch
                          id={`src-${source.id}`}
                          checked={on}
                          onCheckedChange={(checked) => setSourceEnabled(source.id, checked)}
                          aria-label={`Load ${source.label}`}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <a
                          href={datasetUrl(source.datasetId)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground"
                        >
                          {source.datasetId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {on ? (
                          <label className="ml-auto flex items-center gap-1.5">
                            <Checkbox
                              checked={averageSources.includes(source.id)}
                              onCheckedChange={(checked) => setInAverage(source.id, checked === true)}
                              aria-label={`Include ${source.label} in the average`}
                            />
                            in average
                          </label>
                        ) : null}
                      </div>
                      {on && averageSources.includes(source.id) ? (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 px-2 text-[11px]"
                            aria-label={`${source.label}: ${POLARITY_LABELS[polarityOf(source.id)]}. Flip direction`}
                            onClick={() => toggleFlip(source.id)}
                          >
                            <ArrowDownUp className="h-3 w-3" />
                            {POLARITY_LABELS[polarityOf(source.id)]}
                          </Button>
                          {flippedSources.includes(source.id) ? (
                            <span className="text-muted-foreground">(flipped)</span>
                          ) : null}
                        </div>
                      ) : null}
                      {on ? (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          {st?.error ? (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" /> {st.error}
                            </span>
                          ) : data ? (
                            <span>
                              {formatCount(data.total)} {source.unit} ·{" "}
                              {formatCount(Object.keys(data.byNta).length)} neighborhoods
                              {data.truncated ? (
                                <Badge variant="outline" className="ml-1.5 text-[10px]">
                                  capped
                                </Badge>
                              ) : null}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
          <AccordionItem value="unwired">
            <AccordionTrigger className="py-2.5 text-xs uppercase tracking-wide">
              Not on the map (yet)
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5">
              {UNWIRED_DATASETS.map((d) => (
                <p key={d.datasetId} className="text-[11px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">{d.label}</span>{" "}
                  <span className="font-mono">({d.datasetId})</span> — {d.reason}
                </p>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
          Concern score (the Average view) = for each area, the percentile rank
          (0–100) of every ticked source, averaged. Sources marked “higher is
          better” (trees, ramps, speed humps, street improvements, housing)
          count as 100 − percentile, so a high score always means more
          concern. Flip any source with its direction button.
        </p>
      </SheetContent>
    </Sheet>
  );
}
