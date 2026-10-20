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
                Blocks are a fixed ~300 m grid, not census blocks.
              </span>{" "}
              One grid lets noise and crashes stack on the same square. A square
              that straddles a boundary is filed under the neighborhood of its
              first record.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Points outside every neighborhood are counted separately.
              </span>{" "}
              They are never dropped silently — see the coverage numbers below.
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
