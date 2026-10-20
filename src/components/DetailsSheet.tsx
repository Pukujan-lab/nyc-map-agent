import { Camera, Footprints, MapPin, MessageSquarePlus, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import type { CountPair, NtaAggregate, SoqlSource } from "@/lib/geo/types";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import {
  LAYER_LABELS,
  LAYER_METRICS,
  type BlockDatum,
  type SourceBreakdown,
  type ViewInfo,
} from "@/lib/layers";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";
import type { WindowId } from "@/lib/windows";
import { HourOfDayChart } from "./HourOfDayChart";
import { ShowQuery } from "./ShowQuery";
import { StatCard } from "./StatCard";

interface DetailsSheetProps {
  boundary: NtaBoundary | null;
  /** The ~300 m block clicked on the map, if any. */
  block: BlockDatum | null;
  noise: NtaAggregate | null;
  crashes: NtaAggregate | null;
  windowId: WindowId;
  windowLabel: string;
  crashWindowLabel: string;
  sources: SoqlSource[];
  isDesktop: boolean;
  /** Set under a single-source / Average view. */
  view?: ViewInfo;
  /** The current view's value for the neighborhood (and its parts). */
  viewValue?: number;
  breakdown?: SourceBreakdown[];
  /** Every enabled source's count in this neighborhood / block. */
  sourceTotals: Array<{ id: string; label: string; unit: string; nta: number; block: number | null }>;
}

function BreakdownList({ view, breakdown }: { view: ViewInfo; breakdown: SourceBreakdown[] }) {
  return (
    <ul className="space-y-1">
      {breakdown.map((part) => {
        const source = SOURCE_BY_ID[part.sourceId];
        return (
          <li key={part.sourceId} className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate">
              {source?.label ?? part.sourceId}
              {view.kind === "average" ? (
                <span
                  className={part.inverted ? "ml-1 text-emerald-600 dark:text-emerald-400" : "ml-1 text-amber-600 dark:text-amber-400"}
                >
                  {part.inverted ? "↓ higher is better" : "↑ higher is worse"}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatCount(part.value)} {source?.unit}
              {view.kind === "average" && part.percentile !== undefined
                ? ` · p${Math.round(part.percentile)}`
                : ""}
              {view.kind === "average" && part.concern !== undefined
                ? ` → concern ${Math.round(part.concern)}`
                : ""}
            </span>
            {view.kind === "average" ? (
              <span className="sr-only">
                {part.inverted ? "higher is better" : "higher is worse"}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TopList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: CountPair[];
  emptyLabel?: string;
}) {
  const max = items[0]?.[1] ?? 0;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {emptyLabel ?? "No records in this window."}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.slice(0, 5).map(([name, value]) => (
            <li key={name}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="truncate" title={name}>
                  {name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatCount(value)}
                </span>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailsBody({
  boundary,
  block,
  noise,
  crashes,
  windowId,
  windowLabel,
  crashWindowLabel,
  sources,
  onClose,
  onAsk,
  onWidenWindow,
  isDesktop,
  view,
  viewValue,
  breakdown,
  sourceTotals,
}: DetailsSheetProps & {
  onClose: () => void;
  onAsk: (text: string) => void;
  onWidenWindow: () => void;
}) {
  const { layer, selectBlock, startWalk, setDetailsOpen, setStreetViewOpen } =
    useMapState();
  const { setRoutePoint, setRoutePicking, routeStart, routeEnd } = useDataView();
  if (!boundary) return null;

  const here = block
    ? block.center
    : {
        lon: (boundary.bbox[0] + boundary.bbox[2]) / 2,
        lat: (boundary.bbox[1] + boundary.bbox[3]) / 2,
      };

  const walkBlock = () => {
    if (!block) return;
    startWalk(block.center);
    // On a phone the sheet would cover the street you just walked onto.
    if (!isDesktop) setDetailsOpen(false);
  };

  const openStreetView = () => {
    // Both panels are bottom sheets on a phone — show them one at a time.
    if (!isDesktop) setDetailsOpen(false);
    setStreetViewOpen(true);
  };

  const noiseCount = noise?.count ?? 0;
  const crashCount = crashes?.count ?? 0;
  const headline = view
    ? (viewValue ?? 0)
    : layer === "noise"
      ? noiseCount
      : layer === "crashes"
        ? crashCount
        : noiseCount + crashCount;
  const headlineLabel = view
    ? view.unit
    : layer === "noise"
      ? "noise complaints"
      : layer === "crashes"
        ? "crashes"
        : "incidents";
  const nightShare = noise && noise.count > 0 ? noise.nightCount / noise.count : 0;

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-border/60 p-4 pb-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {boundary.ntaName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {boundary.borough} · {windowLabel}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-primary">
              {formatCount(headline)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {headlineLabel}
            </span>
          </div>
        </div>
        {isDesktop ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close details"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
        {block ? (
          <div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Selected block · ~300 m
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Clear selected block"
                className="-mr-1 -mt-1 h-6 w-6 shrink-0"
                onClick={() => selectBlock(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums text-primary">
                {formatCount(block.value)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {view ? view.unit : LAYER_METRICS[layer].unit}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {view
                ? view.label
                : headline > 0
                ? `${formatPercent(block.value / headline)} of this neighborhood`
                : "No records in this neighborhood"}{" "}
              ·{" "}
              {layer === "noise"
                ? `${formatCount(block.nightCount)} after 10pm`
                : layer === "crashes"
                  ? `${formatCount(block.injured)} injured, ${formatCount(block.killed)} killed`
                  : `${formatCount(block.noiseCount)} noise, ${formatCount(block.crashCount)} crashes`}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={walkBlock}
              >
                <Footprints className="h-3.5 w-3.5" />
                Walk this block
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={openStreetView}
              >
                <Camera className="h-3.5 w-3.5" />
                Street photos
              </Button>
            </div>
          </div>
        ) : null}

        {headline === 0 ? (
          <div className="mb-3 rounded-md border border-border/60 bg-muted/30 p-2.5">
            <p className="text-[11px] text-muted-foreground">
              No incidents recorded in this neighborhood for this window.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 text-[11px]"
              onClick={onWidenWindow}
            >
              Widen to the last 12 months
            </Button>
          </div>
        ) : null}

        <Accordion
          type="multiple"
          defaultValue={view ? ["view", "noise-crashes"] : ["noise-crashes"]}
        >
          {view && breakdown ? (
            <AccordionItem value="view">
              <AccordionTrigger className="py-2 text-xs">
                {view.kind === "average" ? "What went into the concern score" : view.label}
              </AccordionTrigger>
              <AccordionContent>
                <BreakdownList view={view} breakdown={breakdown} />
                {view.kind === "average" ? (
                  <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                    p = percentile rank among {block ? "blocks" : "neighborhoods"}.
                    “Higher is better” sources count as 100 − p. The average of the
                    concern values is the concern score (column height).
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem value="noise-crashes">
            <AccordionTrigger className="py-2 text-xs">Noise, crashes &amp; timeline</AccordionTrigger>
            <AccordionContent>
        <Tabs defaultValue="noise">
          <TabsList className="w-full">
            <TabsTrigger value="noise" className="flex-1">
              Noise
            </TabsTrigger>
            <TabsTrigger value="crashes" className="flex-1">
              Crashes
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="noise" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Complaints"
                value={formatCount(noiseCount)}
                hint={windowId === "90d" ? "last 90 days" : "last 12 months"}
              />
              <StatCard
                label="Night share"
                value={formatPercent(nightShare)}
                hint="10pm–4am"
              />
            </div>
            <TopList
              title="Top descriptors"
              items={noise?.topDescriptors ?? []}
            />
            <TopList
              title="Complaint types"
              items={noise?.topTypes ?? []}
            />
            <TopList
              title={
                block ? "Top addresses in this block" : "Top addresses here"
              }
              items={block ? block.addresses : (noise?.topAddresses ?? [])}
              emptyLabel={
                block
                  ? "No address recorded on this block."
                  : "No addresses recorded in this window."
              }
            />
            <p className="text-[10px] leading-snug text-muted-foreground">
              House numbers come from the 311 record&apos;s{" "}
              <code className="font-mono">incident_address</code>, so
              &ldquo;123 Broadway&rdquo; is one address however many complaints
              are filed against it.
            </p>
          </TabsContent>

          <TabsContent value="crashes" className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Injured"
                value={formatCount(crashes?.injured ?? 0)}
              />
              <StatCard
                label="Killed"
                value={formatCount(crashes?.killed ?? 0)}
              />
              <StatCard
                label="Cyclists"
                value={formatCount(crashes?.cyclists ?? 0)}
                hint="injured"
              />
            </div>
            <TopList
              title="Top contributing factors"
              items={crashes?.topFactors ?? []}
            />
            <TopList
              title={block ? "Streets in this block" : "Top streets here"}
              items={block ? block.streets : (crashes?.topStreets ?? [])}
              emptyLabel="No street names recorded."
            />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Crash data covers {crashWindowLabel}; the NYPD dataset runs about
              four months behind. It records the street and cross street, never
              a house number — so these are street names, not addresses.
            </p>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Incidents by hour of day
            </div>
            <HourOfDayChart hours={noise?.hours ?? new Array<number>(24).fill(0)} />
            <p className="text-[10px] leading-snug text-muted-foreground">
              {formatCount(noiseCount)} noise complaints ({windowLabel}) and{" "}
              {formatCount(crashCount)} crashes ({crashWindowLabel}). The bars
              are noise and sum to the neighborhood total.
            </p>
          </TabsContent>
        </Tabs>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="all-sources">
            <AccordionTrigger className="py-2 text-xs">
              All loaded sources here ({sourceTotals.length})
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1">
                {sourceTotals.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatCount(row.nta)} {row.unit}
                      {row.block !== null ? ` · ${formatCount(row.block)} in block` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="directions">
            <AccordionTrigger className="py-2 text-xs">Walking directions</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setRoutePoint("start", here);
                    if (!routeEnd) setRoutePicking("end");
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 text-green-500" />
                  Route from here
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setRoutePoint("end", here);
                    if (!routeStart) setRoutePicking("start");
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 text-red-500" />
                  Route to here
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                Uses the centre of the {block ? "block" : "neighborhood"}. Pick the
                other end on the map from the directions card.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-3 border-t border-border/60 pt-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() =>
              onAsk(
                `How does ${boundary.ntaName} compare on ${
                  LAYER_LABELS[layer].toLowerCase()
                } in ${windowLabel}?`,
              )
            }
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Ask about this neighborhood
          </Button>
          <ShowQuery sources={sources} />
        </div>
      </div>
    </>
  );
}

export function DetailsSheet(props: DetailsSheetProps) {
  const {
    selectedNtaCode,
    seedChat,
    setWindow,
    detailsOpen,
    detailsExpanded,
    setDetailsExpanded,
    setDetailsOpen,
  } = useMapState();
  const { boundary, windowId } = props;

  // A map click opens the small card (`MapPeek`); this sheet is the second,
  // deliberate tap.
  if (!selectedNtaCode || !boundary || !detailsOpen || !detailsExpanded) {
    return null;
  }

  // Closing the sheet goes back to the small card rather than dropping the
  // selection: the map keeps its rim, and the sheet is one tap away again.
  const close = () => setDetailsExpanded(false);
  const ask = (text: string) => {
    seedChat(text);
    // On mobile the chat is a bottom sheet too — close the details first.
    if (!props.isDesktop) setDetailsOpen(false);
  };
  const widen = () => {
    if (windowId !== "12mo") setWindow("12mo");
  };

  const body = (
    <DetailsBody
      {...props}
      onClose={close}
      onAsk={ask}
      onWidenWindow={widen}
    />
  );

  if (props.isDesktop) {
    return (
      <Card
        className={cn(
          // Sits above the dock, which owns the bottom of the screen.
          "absolute right-4 top-4 z-30 flex max-h-[calc(100%-7rem)] w-[380px] flex-col overflow-hidden p-0",
        )}
      >
        {body}
      </Card>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col overflow-hidden p-0"
      >
        <SheetTitle className="sr-only">
          Neighborhood details for {boundary.ntaName}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Noise, crash, and hour-of-day details for {boundary.ntaName}
          {props.block ? " and the selected block" : ""}.
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}
