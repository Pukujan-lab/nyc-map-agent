import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatDate } from "@/lib/format";
import type { AggregateResult } from "@/lib/geo/types";
import { useMapState } from "@/lib/store/MapStateContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { USE_BLOCK_TILES } from "@/lib/map/blockTiles";

interface CaveatsSheetProps {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
}

function latestMonth(result: AggregateResult | null): string | null {
  let latest: string | null = null;
  for (const nta of result?.ntas ?? []) {
    for (const [month] of nta.months) {
      if (!latest || month > latest) latest = month;
    }
  }
  return latest;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function CaveatsSheet({ boundaries, noise, crashes }: CaveatsSheetProps) {
  const { caveatsOpen, setCaveatsOpen } = useMapState();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const noiseMonth = latestMonth(noise);
  const crashMonth = latestMonth(crashes);

  return (
    <Sheet open={caveatsOpen} onOpenChange={setCaveatsOpen}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className="flex max-h-[85vh] flex-col overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Data caveats</SheetTitle>
          <SheetDescription>
            What these blocks actually count, and where the numbers come from.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <ul className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                311 counts are reported complaints.
              </span>{" "}
              They measure how often people called, not how loud a street
              actually is. Reporting rates vary by neighborhood.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Crashes lag about four months.
              </span>{" "}
              The NYPD dataset is updated on a delay, so the most recent weeks
              are incomplete.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Neighborhoods come from a spatial join.
              </span>{" "}
              Neither dataset carries a neighborhood code, so every point is
              matched to its NTA polygon in the browser.
            </li>
            <li>
              <span className="font-medium text-foreground">
                {USE_BLOCK_TILES ? "Blocks are DOF tax blocks; street points go to the nearest block face." : "Blocks are a fixed ~300 m grid, not census blocks."}
              </span>{" "}
              One grid lets noise and crashes stack on the same square. A square
              that straddles a boundary is filed under the neighborhood of its
              first record.
            </li>
            <li>
              <span className="font-medium text-foreground">
                House numbers are as filed.
              </span>{" "}
              311&apos;s <code className="font-mono">incident_address</code> is
              the only address field in either dataset, and it is typed by the
              caller. Crash records carry a street and cross street, never a
              house number, so the crash list names streets.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Borough lines are derived.
              </span>{" "}
              They are the outer edge of each borough&apos;s neighborhoods, not
              a separate boundary dataset.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Points outside every neighborhood are counted separately.
              </span>{" "}
              They are never dropped silently — see the coverage numbers below.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Traffic covers only NYC DOT&apos;s sensor corridors.
              </span>{" "}
              Highways, the FDR, bridges and some major avenues (NYC DOT Real-Time Traffic Speed
              Data). Other streets show no traffic colour, which does not mean they are clear.
              Closures are DOT construction closures for today.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Parking shows places and rules, not free spaces.
              </span>{" "}
              Licensed garages and lots (NYC DCWP), OpenStreetMap parking, and NYC DOT parking signs
              and meters. No open feed reports live occupancy.
            </li>
            <li>
              <span className="font-medium text-foreground">Weather and alerts.</span>{" "}
              Open-Meteo (National Weather Service as fallback), NWS active alerts and FloodNet NYC
              street flood sensors, refreshed every 5–10 minutes.
            </li>
          </ul>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Coverage
            </div>
            <Row
              label="Neighborhoods mapped"
              value={formatCount(boundaries?.length ?? 0)}
            />
            <Row
              label="Noise rows assigned"
              value={formatCount(noise?.totalRows ?? 0)}
            />
            <Row
              label="Noise blocks with records"
              value={formatCount((noise?.blocks ?? []).length)}
            />
            <Row
              label="Noise rows outside any neighborhood"
              value={formatCount(noise?.unassignedCount ?? 0)}
            />
            <Row
              label="Crash rows assigned"
              value={formatCount(crashes?.totalRows ?? 0)}
            />
            <Row
              label="Crash rows outside any neighborhood"
              value={formatCount(crashes?.unassignedCount ?? 0)}
            />
            <Row
              label="Malformed rows dropped"
              value={formatCount(
                (noise?.malformedCount ?? 0) + (crashes?.malformedCount ?? 0),
              )}
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Freshness
            </div>
            <Row
              label="Newest noise month"
              value={noiseMonth ? formatDate(`${noiseMonth}-01`) : "—"}
            />
            <Row
              label="Newest crash month"
              value={crashMonth ? formatDate(`${crashMonth}-01`) : "—"}
            />
            <Row
              label="Aggregated"
              value={noise ? formatDate(noise.generatedAt.slice(0, 10)) : "—"}
            />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Sources
            </div>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                <a
                  className="text-primary hover:underline"
                  href="https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9"
                  target="_blank"
                  rel="noreferrer"
                >
                  311 Service Requests (erm2-nwe9)
                </a>
              </li>
              <li>
                <a
                  className="text-primary hover:underline"
                  href="https://data.cityofnewyork.us/Public-Safety/Motor-Vehicle-Collisions-Crashes/h9gi-nx95"
                  target="_blank"
                  rel="noreferrer"
                >
                  Motor Vehicle Collisions (h9gi-nx95)
                </a>
              </li>
              <li>
                <a
                  className="text-primary hover:underline"
                  href="https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson"
                  target="_blank"
                  rel="noreferrer"
                >
                  2020 Neighborhood Tabulation Areas (9nt8-h7nd)
                </a>
              </li>
              <li>
                Basemap ©{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenStreetMap contributors
                </a>
              </li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
