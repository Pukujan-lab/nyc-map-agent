import { Camera, ChevronUp, Footprints, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import type { CountPair, NtaAggregate } from "@/lib/geo/types";
import { LAYER_METRICS, type BlockDatum } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";

interface MapPeekProps {
  boundary: NtaBoundary | null;
  /** The ~300 m block clicked on the map, if the pick was a block. */
  block: BlockDatum | null;
  noise: NtaAggregate | null;
  crashes: NtaAggregate | null;
  windowLabel: string;
  isDesktop: boolean;
}

function headlineValue(
  layer: "noise" | "crashes" | "combined",
  block: BlockDatum | null,
  noise: NtaAggregate | null,
  crashes: NtaAggregate | null,
): number {
  if (block) return block.value;
  const noiseCount = noise?.count ?? 0;
  const crashCount = crashes?.count ?? 0;
  if (layer === "noise") return noiseCount;
  if (layer === "crashes") return crashCount;
  return noiseCount + crashCount;
}

function detailLine(
  layer: "noise" | "crashes" | "combined",
  block: BlockDatum | null,
  noise: NtaAggregate | null,
  crashes: NtaAggregate | null,
): string {
  if (layer === "noise") {
    const nightCount = block ? block.nightCount : (noise?.nightCount ?? 0);
    const total = block ? block.value : (noise?.count ?? 0);
    return total > 0
      ? `${formatCount(nightCount)} after 10pm · ${formatPercent(nightCount / total)}`
      : "No noise complaints in this window";
  }
  if (layer === "crashes") {
    const injured = block ? block.injured : (crashes?.injured ?? 0);
    const killed = block ? block.killed : (crashes?.killed ?? 0);
    return `${formatCount(injured)} injured · ${formatCount(killed)} killed`;
  }
  const noiseCount = block ? block.noiseCount : (noise?.count ?? 0);
  const crashCount = block ? block.crashCount : (crashes?.count ?? 0);
  return `${formatCount(noiseCount)} noise · ${formatCount(crashCount)} crashes`;
}

/**
 * The one address worth naming in the peek. House numbers come from 311's
 * `incident_address`; crash records carry street names instead, so the caption
 * says which one is on screen rather than pretending they are the same thing.
 */
function topPlace(
  layer: "noise" | "crashes" | "combined",
  block: BlockDatum | null,
  noise: NtaAggregate | null,
  crashes: NtaAggregate | null,
): { entry: CountPair; caption: string } | null {
  const addresses = block ? block.addresses : (noise?.topAddresses ?? []);
  const streets = block ? block.streets : (crashes?.topStreets ?? []);

  if (layer === "crashes") {
    const entry = streets[0];
    return entry ? { entry, caption: "Most crashes on" } : null;
  }
  if (layer === "noise") {
    const entry = addresses[0];
    return entry ? { entry, caption: "Most reported address" } : null;
  }
  const entry = addresses[0] ?? streets[0];
  if (!entry) return null;
  return {
    entry,
    caption: addresses[0] ? "Most reported address" : "Most crashes on",
  };
}

/**
 * A map click opens this — a small card over the map, not the full sheet. The
 * map keeps the screen; the card carries the headline, one address and the two
 * actions worth taking from a single square. Expanding it is a deliberate
 * second tap.
 */
export function MapPeek({
  boundary,
  block,
  noise,
  crashes,
  windowLabel,
  isDesktop,
}: MapPeekProps) {
  const {
    layer,
    walking,
    detailsOpen,
    detailsExpanded,
    setDetailsOpen,
    setDetailsExpanded,
    startWalk,
    setStreetViewOpen,
  } = useMapState();

  // Walking is the one mode a card would ruin: it would sit on the street you
  // are walking down.
  if (!detailsOpen || detailsExpanded || walking) return null;
  if (!boundary && !block) return null;

  const title = boundary?.ntaName ?? "This block";
  const subtitle = block
    ? `~300 m block · ${boundary?.borough ?? "New York City"}`
    : `${boundary?.borough ?? "New York City"} · ${windowLabel}`;
  const headline = headlineValue(layer, block, noise, crashes);
  const place = topPlace(layer, block, noise, crashes);

  const walkBlock = () => {
    startWalk(block ? block.center : null);
    // On a phone the card would cover the street you just walked onto.
    if (!isDesktop) setDetailsOpen(false);
  };

  const openPhotos = () => {
    if (!isDesktop) setDetailsOpen(false);
    setStreetViewOpen(true);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[4.25rem] z-30 flex justify-center px-3">
      <Card
        role="region"
        aria-label={`Quick look at ${title}`}
        className="pointer-events-auto w-full max-w-sm p-0 shadow-xl backdrop-blur"
      >
        <div className="flex items-start justify-between gap-2 p-3 pb-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Dismiss the quick look"
            className="-mr-1 -mt-1 h-6 w-6 shrink-0"
            onClick={() => setDetailsOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="px-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {formatCount(headline)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {LAYER_METRICS[layer].unit}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {detailLine(layer, block, noise, crashes)}
          </div>
          {place ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-border/60 pt-1.5 text-[11px]">
              <span className="truncate text-muted-foreground">
                {place.caption}{" "}
                <span className="text-foreground" title={place.entry[0]}>
                  {place.entry[0]}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCount(place.entry[1])}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 p-2.5 pt-2">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 text-[11px]"
            onClick={() => setDetailsExpanded(true)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
            More details
          </Button>
          {block ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Walk this block at street level"
                className="h-8 w-8 shrink-0"
                onClick={walkBlock}
              >
                <Footprints className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Street-level photos of this block"
                className="h-8 w-8 shrink-0"
                onClick={openPhotos}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
