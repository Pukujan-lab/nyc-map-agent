import { haversineKm, type NtaBoundary } from "@/lib/api/nta";
import type { AggregateResult, CountPair, NtaAggregate, SoqlSource } from "@/lib/geo/types";
import type { QueryDataArgs } from "./tools";

export interface QueryRow {
  key: string;
  label: string;
  value: number;
  ntaCode?: string;
}

export interface QueryOutcome {
  rows: QueryRow[];
  source: SoqlSource;
  metricLabel: string;
}

export interface QueryOptions {
  /**
   * Ranking direction, default descending ("most"). Ascending exists only for
   * the mock agent's "quietest / fewest" questions — the tool schema does not
   * expose it, so a model cannot re-order the rows behind a citation.
   */
  order?: "asc" | "desc";
}

const METRIC_LABELS: Record<NonNullable<QueryDataArgs["metric"]>, string> = {
  count: "incident count",
  injured: "people injured",
  killed: "people killed",
  cyclist_injured: "cyclists injured",
  night_count: "incidents 10pm–4am",
  weekend_night_count: "incidents on weekend nights (Fri/Sat 10pm–4am)",
};

const GROUP_LABELS: Record<NonNullable<QueryDataArgs["group_by"]>, string> = {
  nta: "neighborhood",
  borough: "borough",
  intersection: "intersection",
  complaint_type: "complaint type",
  descriptor: "descriptor",
  contributing_factor: "contributing factor",
};

function sumPairs(pairs: CountPair[], wanted?: string[]): number {
  if (!wanted || wanted.length === 0) {
    return pairs.reduce((total, [, value]) => total + value, 0);
  }
  const lowered = wanted.map((value) => value.toLowerCase());
  return pairs.reduce(
    (total, [key, value]) =>
      lowered.includes(key.toLowerCase()) ? total + value : total,
    0,
  );
}

function hourWindow(agg: NtaAggregate, hours: [number, number]): number {
  const [start, end] = hours;
  if (start <= end) {
    return agg.hours.slice(start, end + 1).reduce((a, b) => a + b, 0);
  }
  return (
    agg.hours.slice(start).reduce((a, b) => a + b, 0) +
    agg.hours.slice(0, end + 1).reduce((a, b) => a + b, 0)
  );
}

function monthWindow(agg: NtaAggregate, months: string[]): number {
  return agg.months.reduce(
    (total, [month, value]) => (months.includes(month) ? total + value : total),
    0,
  );
}

function ntaValue(agg: NtaAggregate, args: QueryDataArgs): number {
  const filters = args.filters ?? {};
  if (filters.complaint_types?.length) {
    return sumPairs(agg.topTypes, filters.complaint_types);
  }
  if (filters.descriptors?.length) {
    return sumPairs(agg.topDescriptors, filters.descriptors);
  }
  switch (args.metric) {
    case "injured":
      return agg.injured;
    case "killed":
      return agg.killed;
    case "cyclist_injured":
      return agg.cyclists;
    case "night_count":
      return agg.nightCount;
    case "weekend_night_count":
      return agg.weekendNightCount;
    default:
      if (filters.hours) return hourWindow(agg, filters.hours);
      if (filters.months?.length) return monthWindow(agg, filters.months);
      return agg.count;
  }
}

function metricLabel(args: QueryDataArgs): string {
  if (args.filters?.complaint_types?.length) {
    return args.filters.complaint_types.join(" / ");
  }
  return METRIC_LABELS[args.metric ?? "count"];
}

function selectNtas(
  result: AggregateResult,
  boundaries: NtaBoundary[],
  args: QueryDataArgs,
): Array<{ boundary: NtaBoundary; agg: NtaAggregate; value: number }> {
  const filters = args.filters ?? {};
  const boundaryByCode = new Map(boundaries.map((b) => [b.ntaCode, b]));
  const out: Array<{ boundary: NtaBoundary; agg: NtaAggregate; value: number }> = [];

  for (const agg of result.ntas) {
    const boundary = boundaryByCode.get(agg.ntaCode);
    if (!boundary) continue;
    if (
      filters.borough &&
      boundary.borough.toLowerCase() !== filters.borough.toLowerCase()
    ) {
      continue;
    }
    if (filters.nta_codes?.length && !filters.nta_codes.includes(agg.ntaCode)) {
      continue;
    }
    if (filters.near) {
      const distance = haversineKm(
        filters.near.lat,
        filters.near.lon,
        boundary.center[1],
        boundary.center[0],
      );
      if (distance > filters.near.radius_km) continue;
    }
    out.push({ boundary, agg, value: ntaValue(agg, args) });
  }
  return out;
}

/**
 * Runs a structured query against the already-loaded aggregates. Deterministic,
 * synchronous, and offline — the mock agent and the tool executor share it so
 * the number in the answer and the number in "show query" always match.
 */
export function runStructuredQuery(
  args: QueryDataArgs,
  context: {
    noise: AggregateResult | null;
    crashes: AggregateResult | null;
    boundaries: NtaBoundary[] | null;
  },
  options?: QueryOptions,
): QueryOutcome {
  const order = options?.order ?? "desc";
  const result = args.dataset === "noise" ? context.noise : context.crashes;
  if (!result || !context.boundaries) {
    throw new Error(
      "The data is still loading. Try again once the map has filled in.",
    );
  }

  const groupBy = args.group_by ?? "nta";
  const limit = args.limit ?? 5;
  const label = metricLabel(args);
  const selected = selectNtas(result, context.boundaries, args);

  let rows: QueryRow[] = [];

  if (groupBy === "nta") {
    rows = selected.map((entry) => ({
      key: entry.boundary.ntaCode,
      label: entry.boundary.ntaName,
      value: entry.value,
      ntaCode: entry.boundary.ntaCode,
    }));
  } else if (groupBy === "borough") {
    const totals = new Map<string, number>();
    for (const entry of selected) {
      totals.set(
        entry.boundary.borough,
        (totals.get(entry.boundary.borough) ?? 0) + entry.value,
      );
    }
    rows = Array.from(totals.entries()).map(([borough, value]) => ({
      key: borough,
      label: borough,
      value,
    }));
  } else if (groupBy === "intersection") {
    const boroughFilter = args.filters?.borough?.toLowerCase();
    const ntaFilter = args.filters?.nta_codes;
    rows = result.intersections
      .filter((row) => {
        if (boroughFilter && row.borough.toLowerCase() !== boroughFilter) {
          return false;
        }
        if (ntaFilter?.length && (!row.ntaCode || !ntaFilter.includes(row.ntaCode))) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        key: row.label,
        label: `${row.label} (${row.borough})`,
        value:
          args.metric === "injured"
            ? row.injured
            : args.metric === "killed"
              ? row.killed
              : args.metric === "count"
                ? row.crashes
                : row.cyclists,
        ntaCode: row.ntaCode ?? undefined,
      }));
  } else {
    const key: "topTypes" | "topDescriptors" | "topFactors" =
      groupBy === "complaint_type"
        ? "topTypes"
        : groupBy === "descriptor"
          ? "topDescriptors"
          : "topFactors";
    const totals = new Map<string, number>();
    for (const entry of selected) {
      for (const [name, value] of entry.agg[key]) {
        totals.set(name, (totals.get(name) ?? 0) + value);
      }
    }
    rows = Array.from(totals.entries()).map(([name, value]) => ({
      key: name,
      label: name,
      value,
    }));
  }

  // One ranking rule for every grouping, so "quietest" means the same thing
  // whichever shape the rows took. Ascending drops zero rows, otherwise the
  // 200-odd neighborhoods with no records would always "win" a least question.
  const ranked =
    order === "asc" ? rows.filter((row) => row.value > 0) : rows.slice();
  ranked.sort((a, b) => (order === "asc" ? a.value - b.value : b.value - a.value));
  rows = ranked.slice(0, limit);

  const baseQuery = result.sources[0]?.query ?? "";
  const filterSummary = JSON.stringify(args.filters ?? {});
  const source: SoqlSource = {
    label: `${args.dataset === "noise" ? "311 noise" : "Crashes"} · ${GROUP_LABELS[groupBy]} rollup`,
    query: [
      baseQuery,
      "",
      `-- local rollup (browser worker, no extra request):`,
      `--   group by ${groupBy}`,
      `--   metric  ${label}`,
      `--   filters ${filterSummary}`,
      `--   order   value ${order} limit ${limit}`,
    ].join("\n"),
  };

  return { rows, source, metricLabel: label };
}
