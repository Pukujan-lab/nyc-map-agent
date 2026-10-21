/**
 * The single dataset registry. Every map source is one config entry here; the
 * fetcher (`fetchSource.ts`), the data-sources drawer, the view-mode menu, the
 * legend and the README table all read from this list.
 *
 * Geo columns were verified with live SODA queries (Oct 2026) before wiring:
 * see the `geo` field of each entry. Datasets with no usable lat/lon were left
 * out on purpose — see `UNWIRED_DATASETS`.
 */

export type Polarity = "worse" | "better";

export type SourceCategory =
  | "Complaints"
  | "Safety"
  | "Housing & land use"
  | "Streets & environment";

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "Complaints",
  "Safety",
  "Housing & land use",
  "Streets & environment",
];

interface BaseSource {
  id: string;
  label: string;
  /** Short label for the dock and legend. */
  shortLabel: string;
  category: SourceCategory;
  /** Socrata 4x4 id on data.cityofnewyork.us. */
  datasetId: string;
  description: string;
  /** What one unit of the map value counts, e.g. "violations". */
  unit: string;
  /** Loaded on first visit (before the user touches the drawer). */
  defaultEnabled: boolean;
  /**
   * Default direction for the Average ("Concern score"): `worse` means more
   * records is more concern (complaints, crashes, violations); `better` means
   * more is good (trees, ramps, traffic calming, housing), so the Average
   * uses 100 − percentile. Users can flip it per source (URL `flip`).
   */
  polarity: Polarity;
}

/**
 * Noise and crashes keep their dedicated worker pipeline (hour-of-day,
 * addresses, injuries…); the registry only needs their per-area counts.
 */
export interface BuiltinSource extends BaseSource {
  kind: "builtin";
  builtin: "noise" | "crashes";
}

/**
 * Numeric latitude/longitude columns: aggregated **server-side** with a SoQL
 * `GROUP BY floor(lat / 0.003), floor(lon / 0.003)` — the exact block grid of
 * `src/lib/geo/blocks.ts` — so even 850k-row datasets cost one small request.
 */
export interface GridSource extends BaseSource {
  kind: "grid";
  lat: string;
  lon: string;
  /** Text columns need a `::number` cast before arithmetic. */
  castNumber?: boolean;
  /** Date column filtered to the selected time window; omit for inventories. */
  dateField?: string;
  /** `count` (default) or `sum:<numeric column>`. */
  measure?: "count" | `sum:${string}`;
  where?: string;
}

/**
 * Only a GeoJSON geometry column (point / multipoint / multiline): rows are
 * paged and reduced to one representative point each in the browser.
 */
export interface GeometrySource extends BaseSource {
  kind: "geometry";
  geom: string;
  /** Hard cap on rows pulled, so a slow network cannot stall the map. */
  maxRows: number;
  dateField?: string;
  where?: string;
}

export type SourceConfig = BuiltinSource | GridSource | GeometrySource;

export const SOURCES: SourceConfig[] = [
  {
    id: "noise",
    polarity: "worse",
    kind: "builtin",
    builtin: "noise",
    label: "311 noise complaints",
    shortLabel: "Noise",
    category: "Complaints",
    datasetId: "erm2-nwe9",
    description: "311 requests whose complaint type starts with “Noise”.",
    unit: "complaints",
    defaultEnabled: true,
  },
  {
    id: "311",
    polarity: "worse",
    kind: "grid",
    label: "All 311 service requests",
    shortLabel: "311 (all)",
    category: "Complaints",
    datasetId: "erm2-nwe9",
    description:
      "Every 311 service request (heat, parking, sanitation, noise…) in the window.",
    unit: "requests",
    lat: "latitude",
    lon: "longitude",
    dateField: "created_date",
    defaultEnabled: true,
  },
  {
    id: "crashes",
    polarity: "worse",
    kind: "builtin",
    builtin: "crashes",
    label: "Motor vehicle crashes",
    shortLabel: "Crashes",
    category: "Safety",
    datasetId: "h9gi-nx95",
    description: "NYPD-reported collisions (always the latest 12 months).",
    unit: "crashes",
    defaultEnabled: true,
  },
  {
    id: "hpd",
    polarity: "worse",
    kind: "grid",
    label: "HPD housing violations",
    shortLabel: "HPD violations",
    category: "Housing & land use",
    datasetId: "wvxf-dwi5",
    description: "Housing Maintenance Code violations by inspection date.",
    unit: "violations",
    lat: "latitude",
    lon: "longitude",
    castNumber: true,
    dateField: "inspectiondate",
    defaultEnabled: false,
  },
  {
    id: "pluto-units",
    polarity: "better",
    kind: "grid",
    label: "Residential units (PLUTO)",
    shortLabel: "Res. units",
    category: "Housing & land use",
    datasetId: "64uk-42ks",
    description:
      "Sum of residential units across tax lots (MapPLUTO). Current snapshot, not windowed.",
    unit: "units",
    lat: "latitude",
    lon: "longitude",
    measure: "sum:unitsres",
    defaultEnabled: false,
  },
  {
    id: "trees",
    polarity: "better",
    kind: "grid",
    label: "Street trees (2015 census)",
    shortLabel: "Trees",
    category: "Streets & environment",
    datasetId: "uvpi-gqnh",
    description: "Street trees counted in the 2015 TreesCount! census.",
    unit: "trees",
    lat: "latitude",
    lon: "longitude",
    castNumber: true,
    where: "status = 'Alive'",
    defaultEnabled: false,
  },
  {
    id: "ramps",
    polarity: "better",
    kind: "geometry",
    label: "Pedestrian ramps",
    shortLabel: "Ramps",
    category: "Streets & environment",
    datasetId: "ufzp-rrqu",
    description: "Curb ramp locations surveyed by DOT.",
    unit: "ramps",
    geom: "the_geom",
    maxRows: 250_000,
    defaultEnabled: false,
  },
  {
    id: "speed-humps",
    polarity: "better",
    kind: "geometry",
    label: "Speed humps",
    shortLabel: "Speed humps",
    category: "Safety",
    datasetId: "jknp-skuy",
    description: "Vision Zero speed-hump segments (counted once per segment).",
    unit: "segments",
    geom: "the_geom",
    maxRows: 20_000,
    defaultEnabled: false,
  },
  {
    id: "sip-corridors",
    polarity: "better",
    kind: "geometry",
    label: "Street improvement corridors",
    shortLabel: "SIP corridors",
    category: "Safety",
    datasetId: "if4c-w48d",
    description: "Vision Zero Street Improvement Project corridors.",
    unit: "projects",
    geom: "the_geom",
    maxRows: 10_000,
    defaultEnabled: false,
  },
  {
    id: "sip-intersections",
    polarity: "better",
    kind: "grid",
    label: "Street improvement intersections",
    shortLabel: "SIP intersections",
    category: "Safety",
    datasetId: "shr7-eqdc",
    description: "Vision Zero Street Improvement Project intersections.",
    unit: "projects",
    lat: "lat",
    lon: "long",
    castNumber: true,
    defaultEnabled: false,
  },
];

/** Requested but not wired, with the reason found when probing them live. */
export const UNWIRED_DATASETS: Array<{ datasetId: string; label: string; reason: string }> = [
  {
    datasetId: "eabe-havv",
    label: "DOB complaints",
    reason: "No coordinates — only house number, street and BIN.",
  },
  {
    datasetId: "7ym2-wayt",
    label: "Automated traffic volume counts",
    reason:
      "Geometry is a WKT string in NY State Plane feet (EPSG:2263); needs a reprojection library.",
  },
  {
    datasetId: "5zhs-2jue",
    label: "Building footprints",
    reason: "~1M multipolygons with no centroid column; too heavy for the browser.",
  },
];

export const SOURCE_BY_ID: Record<string, SourceConfig> = Object.fromEntries(
  SOURCES.map((source) => [source.id, source]),
);

export const DEFAULT_ENABLED_SOURCES = SOURCES.filter((s) => s.defaultEnabled).map(
  (s) => s.id,
);

/** Parses a comma list from the URL, dropping unknown ids. */
export function parseSourceList(value: string | null, fallback: string[]): string[] {
  if (value === null) return fallback;
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id in SOURCE_BY_ID);
  return Array.from(new Set(ids));
}

export function datasetUrl(datasetId: string): string {
  return `https://data.cityofnewyork.us/d/${datasetId}`;
}

/** Effective direction after the user's flips. */
export function effectivePolarity(id: string, flipped: readonly string[]): Polarity {
  const base = SOURCE_BY_ID[id]?.polarity ?? "worse";
  if (!flipped.includes(id)) return base;
  return base === "worse" ? "better" : "worse";
}

export const POLARITY_LABELS: Record<Polarity, string> = {
  worse: "higher is worse",
  better: "higher is better",
};
