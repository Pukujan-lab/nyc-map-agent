/**
 * The noise / crash rollup, independent of where rows come from. The browser
 * worker feeds it Socrata pages (socrata backend); scripts/build-aggregates.ts
 * feeds it Octo rows and stores the result for /api/aggregate (octo backend).
 */
import {
  CRASH_DATASET,
  CRASH_SELECT,
  crashRowSchema,
  crashWhere,
  isUnspecifiedFactor,
} from "@/lib/api/crashes";
import {
  NOISE_DATASET,
  NOISE_SELECT,
  isInNyc,
  noiseRowSchema,
  noiseWhere,
} from "@/lib/api/noise";
import {
  buildSocrataUrl,
  fetchSocrataCount,
  fetchSocrataCsv,
  parseCsv,
  type CsvTable,
} from "@/lib/api/socrata";
import { blockKey } from "./blocks";
import { NtaIndex } from "./ntaIndex";
import type {
  AggregateResult,
  AggregateWorkerRequest,
  BlockCell,
  BoroughAggregate,
  CountPair,
  IntersectionRow,
  NtaAggregate,
} from "./types";

const PAGE_SIZE = 50000;
const MAX_ROWS = 900000;
const TOP_N = 8;
/** Noise has only a handful of complaint types, so keep them all. */
const TOP_TYPES = 12;
/** Addresses per neighborhood, and per ~300 m square. */
const TOP_ADDRESSES = 8;
const BLOCK_ADDRESSES = 3;


interface NtaAcc {
  count: number;
  hours: number[];
  night: number;
  weekendNight: number;
  months: Map<string, number>;
  heliMonths: Map<string, number>;
  types: Map<string, number>;
  descriptors: Map<string, number>;
  factors: Map<string, number>;
  addresses: Map<string, number>;
  streets: Map<string, number>;
  injured: number;
  killed: number;
  cyclists: number;
  pedestrians: number;
}

function createAcc(): NtaAcc {
  return {
    count: 0,
    hours: new Array<number>(24).fill(0),
    night: 0,
    weekendNight: 0,
    months: new Map(),
    heliMonths: new Map(),
    types: new Map(),
    descriptors: new Map(),
    factors: new Map(),
    addresses: new Map(),
    streets: new Map(),
    injured: 0,
    killed: 0,
    cyclists: 0,
    pedestrians: 0,
  };
}

interface BlockAcc {
  lon: number;
  lat: number;
  ntaCode: string;
  count: number;
  night: number;
  injured: number;
  killed: number;
  cyclists: number;
  addresses: Map<string, number>;
  streets: Map<string, number>;
}

/**
 * Adds one record to its ~300 m square and returns the accumulator so callers
 * can layer dataset-specific numbers on top.
 */
function bumpBlock(
  blocks: Map<string, BlockAcc>,
  lat: number,
  lon: number,
  ntaCode: string,
  night: boolean,
): BlockAcc {
  const cell = blockKey(lat, lon);
  let acc = blocks.get(cell.key);
  if (!acc) {
    acc = {
      lon: cell.lon,
      lat: cell.lat,
      ntaCode,
      count: 0,
      night: 0,
      injured: 0,
      killed: 0,
      cyclists: 0,
      addresses: new Map(),
      streets: new Map(),
    };
    blocks.set(cell.key, acc);
  }
  acc.count += 1;
  if (night) acc.night += 1;
  return acc;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topPairs(map: Map<string, number>, limit: number): CountPair[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]): CountPair => [key, value]);
}

/**
 * `incident_address` arrives as free text ("123 BROADWAY", sometimes with
 * doubled spaces or a trailing borough). Case and spacing are normalised so the
 * same address on two rows lands on one count; the string is capped so a
 * pathological value cannot bloat the cached aggregate.
 */
function normalizeAddress(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ").toUpperCase();
  return cleaned.length > 48 ? cleaned.slice(0, 48) : cleaned;
}

function hourFromIso(iso: string): number {
  const hour = Number.parseInt(iso.slice(11, 13), 10);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 0;
}

function hourFromCrash(date: string, time: string): number {
  if (time.length >= 2) {
    const parsed = Number.parseInt(time.slice(0, 2), 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < 24) return parsed;
  }
  return hourFromIso(date);
}

function weekdayFromDate(iso: string): number {
  const year = Number.parseInt(iso.slice(0, 4), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  const day = Number.parseInt(iso.slice(8, 10), 10);
  if (!year || !month || !day) return 0;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 10pm–4am. */
function isNightHour(hour: number): boolean {
  return hour >= 22 || hour < 4;
}

/** Friday 22:00 → Saturday 04:00 and Saturday 22:00 → Sunday 04:00. */
function isWeekendNight(hour: number, weekday: number): boolean {
  if (hour >= 22) return weekday === 5 || weekday === 6;
  if (hour < 4) return weekday === 6 || weekday === 0;
  return false;
}

function indexColumns(header: string[]): Map<string, number> {
  const columns = new Map<string, number>();
  header.forEach((name, index) => columns.set(name.trim(), index));
  return columns;
}

function requireColumn(columns: Map<string, number>, name: string): number {
  const index = columns.get(name);
  if (index === undefined) {
    throw new Error(`Socrata response is missing the "${name}" column.`);
  }
  return index;
}

/** Where rows come from: Socrata CSV pages in the browser, Octo pages in scripts. */
export interface RowSource {
  count(): Promise<number>;
  /** Rows per page; defaults to Socrata's 50,000. Octo caps a query at 10,000. */
  pageSize?: number;
  /** One page of rows with Socrata column names (see NOISE_FIELDS / CRASH_FIELDS). */
  page(offset: number, limit: number): Promise<CsvTable>;
}

export type ProgressFn = (message: { phase: "counting" | "fetching" | "joining"; loaded: number; total: number }) => void;

/** Socrata rows for a request, as the browser worker reads them. */
export function socrataRowSource(request: AggregateWorkerRequest): RowSource {
  const isNoise = request.dataset === "noise";
  const dataset = isNoise ? NOISE_DATASET : CRASH_DATASET;
  const select = isNoise ? NOISE_SELECT : CRASH_SELECT;
  const where = isNoise
    ? noiseWhere(request.windowStart, request.windowEnd)
    : crashWhere(request.windowStart, request.windowEnd);
  const orderColumn = isNoise ? "unique_key" : "collision_id";
  return {
    count: () => fetchSocrataCount(dataset, where),
    page: async (offset, limit) =>
      parseCsv(
        await fetchSocrataCsv(dataset, {
          $select: select,
          $where: where,
          $order: orderColumn,
          $limit: String(limit),
          $offset: String(offset),
        }),
      ),
  };
}

async function aggregatePages(
  source: RowSource,
  isNoise: boolean,
  index: NtaIndex,
  request: AggregateWorkerRequest,
  accs: NtaAcc[],
  counters: { unassigned: number; malformed: number },
  intersectionMap: Map<string, IntersectionRow>,
  blocks: Map<string, BlockAcc>,
  onProgress: ProgressFn,
): Promise<void> {
  onProgress({ phase: "counting", loaded: 0, total: 0 });
  const total = await source.count();
  onProgress({ phase: "fetching", loaded: 0, total });

  const boroughByNta = new Map<string, string>();
  for (const boundary of request.boundaries) {
    boroughByNta.set(boundary.ntaCode, boundary.borough);
  }

  const rowLimit = Math.min(total, MAX_ROWS);
  let offset = 0;
  let loaded = 0;
  let columns: Map<string, number> | null = null;
  const pageSize = source.pageSize ?? PAGE_SIZE;

  while (offset < rowLimit) {
    const table: CsvTable = await source.page(offset, pageSize);
    if (table.rows.length === 0) break;
    if (!columns) columns = indexColumns(table.header);

    if (isNoise) {
      processNoiseRows(table, columns, index, accs, counters, blocks);
    } else {
      processCrashRows(
        table,
        columns,
        index,
        accs,
        counters,
        intersectionMap,
        boroughByNta,
        blocks,
      );
    }

    offset += table.rows.length;
    loaded += table.rows.length;
    onProgress({ phase: "fetching", loaded, total });
    if (table.rows.length < pageSize) break;
  }
}

function processNoiseRows(
  table: CsvTable,
  columns: Map<string, number>,
  index: NtaIndex,
  accs: NtaAcc[],
  counters: { unassigned: number; malformed: number },
  blocks: Map<string, BlockAcc>,
): void {
  const latIdx = requireColumn(columns, "latitude");
  const lonIdx = requireColumn(columns, "longitude");
  const typeIdx = requireColumn(columns, "complaint_type");
  const descIdx = requireColumn(columns, "descriptor");
  const dateIdx = requireColumn(columns, "created_date");
  const addressIdx = columns.get("incident_address") ?? -1;

  for (const row of table.rows) {
    const parsed = noiseRowSchema.safeParse({
      latitude: row[latIdx],
      longitude: row[lonIdx],
      complaint_type: row[typeIdx],
      descriptor: row[descIdx],
      created_date: row[dateIdx],
      incident_address: addressIdx >= 0 ? row[addressIdx] : "",
    });
    if (!parsed.success) {
      counters.malformed += 1;
      continue;
    }
    const value = parsed.data;
    if (!isInNyc(value.latitude, value.longitude)) {
      counters.unassigned += 1;
      continue;
    }
    const ntaIndex = index.assignIndex(value.latitude, value.longitude);
    if (ntaIndex === -1) {
      counters.unassigned += 1;
      continue;
    }

    const acc = accs[ntaIndex];
    acc.count += 1;
    const hour = hourFromIso(value.created_date);
    const weekday = weekdayFromDate(value.created_date);
    const night = isNightHour(hour);
    acc.hours[hour] += 1;
    if (night) acc.night += 1;
    if (isWeekendNight(hour, weekday)) acc.weekendNight += 1;
    const block = bumpBlock(
      blocks,
      value.latitude,
      value.longitude,
      index.boundaries[ntaIndex].ntaCode,
      night,
    );
    const month = value.created_date.slice(0, 7);
    bump(acc.months, month);
    bump(acc.types, value.complaint_type);
    bump(acc.descriptors, value.descriptor || "Unspecified");
    const address = normalizeAddress(value.incident_address);
    if (address) {
      bump(acc.addresses, address);
      bump(block.addresses, address);
    }
    if (value.complaint_type.includes("Helicopter")) {
      bump(acc.heliMonths, month);
    }
  }
}

function processCrashRows(
  table: CsvTable,
  columns: Map<string, number>,
  index: NtaIndex,
  accs: NtaAcc[],
  counters: { unassigned: number; malformed: number },
  intersectionMap: Map<string, IntersectionRow>,
  boroughByNta: Map<string, string>,
  blocks: Map<string, BlockAcc>,
): void {
  const latIdx = requireColumn(columns, "latitude");
  const lonIdx = requireColumn(columns, "longitude");
  const dateIdx = requireColumn(columns, "crash_date");
  const timeIdx = requireColumn(columns, "crash_time");
  const onIdx = requireColumn(columns, "on_street_name");
  const crossIdx = requireColumn(columns, "cross_street_name");
  const injuredIdx = requireColumn(columns, "number_of_persons_injured");
  const killedIdx = requireColumn(columns, "number_of_persons_killed");
  const cyclistIdx = requireColumn(columns, "number_of_cyclist_injured");
  const pedestrianIdx = requireColumn(columns, "number_of_pedestrians_injured");
  const factorIdx = requireColumn(columns, "contributing_factor_vehicle_1");

  for (const row of table.rows) {
    const parsed = crashRowSchema.safeParse({
      latitude: row[latIdx],
      longitude: row[lonIdx],
      crash_date: row[dateIdx],
      crash_time: row[timeIdx],
      on_street_name: row[onIdx],
      cross_street_name: row[crossIdx],
      number_of_persons_injured: row[injuredIdx],
      number_of_persons_killed: row[killedIdx],
      number_of_cyclist_injured: row[cyclistIdx],
      number_of_pedestrians_injured: row[pedestrianIdx],
      contributing_factor_vehicle_1: row[factorIdx],
    });
    if (!parsed.success) {
      counters.malformed += 1;
      continue;
    }
    const value = parsed.data;
    if (!isInNyc(value.latitude, value.longitude)) {
      counters.unassigned += 1;
      continue;
    }
    const ntaIndex = index.assignIndex(value.latitude, value.longitude);
    if (ntaIndex === -1) {
      counters.unassigned += 1;
      continue;
    }

    const acc = accs[ntaIndex];
    acc.count += 1;
    const hour = hourFromCrash(value.crash_date, value.crash_time);
    const weekday = weekdayFromDate(value.crash_date);
    acc.hours[hour] += 1;
    if (isNightHour(hour)) acc.night += 1;
    if (isWeekendNight(hour, weekday)) acc.weekendNight += 1;
    bump(acc.months, value.crash_date.slice(0, 7));
    acc.injured += value.number_of_persons_injured;
    acc.killed += value.number_of_persons_killed;
    acc.cyclists += value.number_of_cyclist_injured;
    acc.pedestrians += value.number_of_pedestrians_injured;

    const block = bumpBlock(
      blocks,
      value.latitude,
      value.longitude,
      index.boundaries[ntaIndex].ntaCode,
      isNightHour(hour),
    );
    block.injured += value.number_of_persons_injured;
    block.killed += value.number_of_persons_killed;
    block.cyclists += value.number_of_cyclist_injured;

    const factor = value.contributing_factor_vehicle_1.trim();
    if (!isUnspecifiedFactor(factor)) bump(acc.factors, factor);

    const onStreet = value.on_street_name.trim();
    if (onStreet) {
      bump(acc.streets, onStreet);
      bump(block.streets, onStreet);
    }
    const crossStreet = value.cross_street_name.trim();
    if (onStreet && crossStreet) {
      const key = `${onStreet}|${crossStreet}`;
      const ntaCode = index.boundaries[ntaIndex].ntaCode;
      const existing = intersectionMap.get(key);
      if (existing) {
        existing.crashes += 1;
        existing.cyclists += value.number_of_cyclist_injured;
        existing.injured += value.number_of_persons_injured;
        existing.killed += value.number_of_persons_killed;
      } else {
        intersectionMap.set(key, {
          label: `${onStreet} & ${crossStreet}`,
          onStreet,
          crossStreet,
          ntaCode,
          borough: boroughByNta.get(ntaCode) ?? "Unspecified",
          crashes: 1,
          cyclists: value.number_of_cyclist_injured,
          injured: value.number_of_persons_injured,
          killed: value.number_of_persons_killed,
        });
      }
    }
  }
}

function finalize(
  request: AggregateWorkerRequest,
  accs: NtaAcc[],
  counters: { unassigned: number; malformed: number },
  intersectionMap: Map<string, IntersectionRow>,
  blocks: Map<string, BlockAcc>,
): AggregateResult {
  const ntas: NtaAggregate[] = request.boundaries.map((boundary, i) => {
    const acc = accs[i];
    return {
      ntaCode: boundary.ntaCode,
      count: acc.count,
      nightCount: acc.night,
      weekendNightCount: acc.weekendNight,
      hours: acc.hours,
      months: Array.from(acc.months.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]): CountPair => [key, value]),
      helicopterMonths: Array.from(acc.heliMonths.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]): CountPair => [key, value]),
      topTypes: topPairs(acc.types, TOP_TYPES),
      topDescriptors: topPairs(acc.descriptors, TOP_N),
      topFactors: topPairs(acc.factors, TOP_N),
      topAddresses: topPairs(acc.addresses, TOP_ADDRESSES),
      topStreets: topPairs(acc.streets, TOP_N),
      injured: acc.injured,
      killed: acc.killed,
      cyclists: acc.cyclists,
      pedestrians: acc.pedestrians,
      severity: acc.count + 3 * acc.injured + 10 * acc.killed,
    };
  });

  const boroughMap = new Map<string, { count: number; injured: number; killed: number; cyclists: number; factors: Map<string, number> }>();
  ntas.forEach((nta, i) => {
    const borough = request.boundaries[i].borough;
    let entry = boroughMap.get(borough);
    if (!entry) {
      entry = { count: 0, injured: 0, killed: 0, cyclists: 0, factors: new Map() };
      boroughMap.set(borough, entry);
    }
    entry.count += nta.count;
    entry.injured += nta.injured;
    entry.killed += nta.killed;
    entry.cyclists += nta.cyclists;
    for (const [factor, value] of accs[i].factors.entries()) {
      entry.factors.set(factor, (entry.factors.get(factor) ?? 0) + value);
    }
  });

  const boroughs: BoroughAggregate[] = Array.from(boroughMap.entries())
    .map(([borough, entry]) => ({
      borough,
      count: entry.count,
      injured: entry.injured,
      killed: entry.killed,
      cyclists: entry.cyclists,
      factors: topPairs(entry.factors, 25),
    }))
    .sort((a, b) => b.count - a.count);

  const intersections = Array.from(intersectionMap.values())
    .sort((a, b) => b.cyclists - a.cyclists || b.crashes - a.crashes)
    .slice(0, 80);

  const blockCells: BlockCell[] = Array.from(blocks.entries()).map(
    ([key, acc]) => ({
      key,
      lon: acc.lon,
      lat: acc.lat,
      ntaCode: acc.ntaCode,
      count: acc.count,
      nightCount: acc.night,
      injured: acc.injured,
      killed: acc.killed,
      cyclists: acc.cyclists,
      ...(acc.addresses.size > 0
        ? { addresses: topPairs(acc.addresses, BLOCK_ADDRESSES) }
        : {}),
      ...(acc.streets.size > 0
        ? { streets: topPairs(acc.streets, BLOCK_ADDRESSES) }
        : {}),
    }),
  );

  const isNoise = request.dataset === "noise";
  const dataset = isNoise ? NOISE_DATASET : CRASH_DATASET;
  const select = isNoise ? NOISE_SELECT : CRASH_SELECT;
  const where = isNoise
    ? noiseWhere(request.windowStart, request.windowEnd)
    : crashWhere(request.windowStart, request.windowEnd);

  return {
    dataset: request.dataset,
    windowId: request.windowId,
    windowStart: request.windowStart,
    windowEnd: request.windowEnd,
    generatedAt: new Date().toISOString(),
    totalRows: ntas.reduce((sum, nta) => sum + nta.count, 0),
    unassignedCount: counters.unassigned,
    malformedCount: counters.malformed,
    ntas,
    blocks: blockCells,
    boroughs,
    intersections,
    sources: [
      {
        label: isNoise
          ? "311 noise rows → neighborhood rollup"
          : "Crash rows → neighborhood rollup",
        query: buildSocrataUrl(dataset, "csv", {
          $select: select,
          $where: where,
          $order: isNoise ? "unique_key" : "collision_id",
          $limit: String(PAGE_SIZE),
        }),
      },
    ],
  };
}

/** Runs the whole rollup for one dataset × window over any row source. */
export async function aggregateRows(
  request: AggregateWorkerRequest,
  source: RowSource,
  onProgress: ProgressFn = () => {},
): Promise<AggregateResult> {
  const accs = request.boundaries.map(() => createAcc());
  const counters = { unassigned: 0, malformed: 0 };
  const intersectionMap = new Map<string, IntersectionRow>();
  const blocks = new Map<string, BlockAcc>();
  const index = new NtaIndex(request.boundaries);
  await aggregatePages(
    source,
    request.dataset === "noise",
    index,
    request,
    accs,
    counters,
    intersectionMap,
    blocks,
    onProgress,
  );
  onProgress({ phase: "joining", loaded: 0, total: 0 });
  return finalize(request, accs, counters, intersectionMap, blocks);
}
