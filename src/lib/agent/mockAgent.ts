import { haversineKm, type NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import type { AggregateResult, NtaAggregate } from "@/lib/geo/types";
import type { LayerId } from "@/lib/layers";
import { windowBounds } from "@/lib/windows";
import type { AgentClient, AgentContext, AgentReply, ChatTurn } from "./client";
import { BOROUGH_CENTERS, findBoundary } from "./places";
import type { AgentToolCall } from "./tools";

/** Crash data lags, so crash answers always name the crash window. */
function crashWindowLabel(ctx: AgentContext): string {
  return ctx.crashes
    ? windowBounds(ctx.crashes.windowId).label
    : ctx.windowLabel;
}

const HELIPORT = {
  name: "Downtown Manhattan Heliport",
  lat: 40.7012,
  lon: -73.9865,
  radiusKm: 2.5,
};

function notReady(): AgentReply {
  return {
    text: "I'm still aggregating the Socrata data — give me a few seconds and ask again.",
    toolCalls: [],
  };
}

function findAgg(
  result: AggregateResult | null,
  ntaCode: string,
): NtaAggregate | null {
  return result?.ntas.find((nta) => nta.ntaCode === ntaCode) ?? null;
}

function typeCount(agg: NtaAggregate, type: string): number {
  const match = agg.topTypes.find(
    ([name]) => name.toLowerCase() === type.toLowerCase(),
  );
  return match ? match[1] : 0;
}

function nameOf(boundaries: NtaBoundary[], ntaCode: string): string {
  return boundaries.find((b) => b.ntaCode === ntaCode)?.ntaName ?? ntaCode;
}

function layerCount(
  layer: LayerId,
  noise: NtaAggregate | null,
  crashes: NtaAggregate | null,
): number {
  if (layer === "noise") return noise?.count ?? 0;
  if (layer === "crashes") return crashes?.count ?? 0;
  return (noise?.count ?? 0) + (crashes?.count ?? 0);
}

function layerMetricLabel(layer: LayerId): string {
  if (layer === "noise") return "noise complaints";
  if (layer === "crashes") return "crashes";
  return "incidents";
}

/** Most recent Jun–Aug that appears in the loaded data. */
function lastSummerMonths(result: AggregateResult | null): string[] {
  const months = new Set<string>();
  for (const nta of result?.ntas ?? []) {
    for (const [month] of nta.months) months.add(month);
  }
  const sorted = Array.from(months).sort();
  const latest = sorted[sorted.length - 1];
  if (!latest) return [];
  const year = Number.parseInt(latest.slice(0, 4), 10);
  const month = Number.parseInt(latest.slice(5, 7), 10);
  const summerYear = month >= 8 ? year : year - 1;
  return [`${summerYear}-06`, `${summerYear}-07`, `${summerYear}-08`];
}

function bushwickAnswer(ctx: AgentContext, weekend: boolean): AgentReply {
  if (!ctx.noise || !ctx.boundaries) return notReady();
  const boundaries = ctx.boundaries;
  const codes = new Set(
    boundaries
      .filter((boundary) => /bushwick/i.test(boundary.ntaName))
      .map((boundary) => boundary.ntaCode),
  );
  const ranked = ctx.noise.ntas
    .filter((nta) => codes.has(nta.ntaCode))
    .map((nta) => ({
      agg: nta,
      value: weekend ? nta.weekendNightCount : nta.nightCount,
    }))
    .sort((a, b) => b.value - a.value);

  const top = ranked[0];
  if (!top) return notReady();
  const boundary = boundaries.find((b) => b.ntaCode === top.agg.ntaCode);
  if (!boundary) return notReady();

  const windowPhrase = weekend
    ? "on weekend nights (10pm–4am)"
    : "between 10pm and 4am";
  const descriptor = top.agg.topDescriptors[0];
  const nightShare =
    top.agg.count > 0 ? top.agg.nightCount / top.agg.count : 0;

  const text = [
    `${formatCount(top.value)} noise complaints ${windowPhrase} in ${boundary.ntaName} — the loudest neighborhood in Bushwick over ${ctx.windowLabel}.`,
    descriptor
      ? `The most common descriptor there is “${descriptor[0]}” (${formatCount(descriptor[1])} complaints).`
      : "",
    `${formatPercent(nightShare)} of all ${formatCount(top.agg.count)} noise complaints in this neighborhood land in the 10pm–4am window.`,
  ]
    .filter(Boolean)
    .join(" ");

  const toolCalls: AgentToolCall[] = [
    { name: "set_layer", args: { layer: "noise" } },
    { name: "highlight", args: { nta_codes: [boundary.ntaCode] } },
    {
      name: "fly_to",
      args: {
        lat: boundary.center[1],
        lon: boundary.center[0],
        zoom: 13.6,
        pitch: 55,
      },
    },
  ];

  return {
    text,
    toolCalls,
    spoken: `${formatCount(top.value)} noise complaints ${windowPhrase} in ${boundary.ntaName}, the loudest neighborhood in Bushwick.`,
  };
}

function residentialRanking(ctx: AgentContext): AgentReply {
  if (!ctx.noise || !ctx.boundaries) return notReady();
  const boundaries = ctx.boundaries;
  const ranked = ctx.noise.ntas
    .map((nta) => ({
      agg: nta,
      value: typeCount(nta, "Noise - Residential"),
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (ranked.length === 0) {
    return {
      text: `No residential noise complaints were recorded in ${ctx.windowLabel}. Try widening the time window.`,
      toolCalls: [],
    };
  }

  const total = ranked.reduce((sum, entry) => sum + entry.value, 0);
  const lines = ranked.map(
    (entry, index) =>
      `${index + 1}. ${nameOf(boundaries, entry.agg.ntaCode)} — ${formatCount(entry.value)}`,
  );

  const top = ranked[0];
  const boundary = boundaries.find((b) => b.ntaCode === top.agg.ntaCode);

  const text = [
    `${formatCount(top.value)} residential noise complaints in ${nameOf(boundaries, top.agg.ntaCode)} — the most in the city over ${ctx.windowLabel}.`,
    "",
    ...lines,
    "",
    `Together the top 5 account for ${formatCount(total)} residential noise complaints.`,
  ].join("\n");

  const toolCalls: AgentToolCall[] = [
    { name: "set_layer", args: { layer: "noise" } },
    {
      name: "highlight",
      args: { nta_codes: ranked.map((entry) => entry.agg.ntaCode) },
    },
    boundary
      ? {
          name: "fly_to",
          args: {
            lat: boundary.center[1],
            lon: boundary.center[0],
            zoom: 11.4,
            pitch: 50,
          },
        }
      : { name: "set_layer", args: { layer: "noise" } },
  ];

  return {
    text,
    toolCalls,
    spoken: `${nameOf(boundaries, top.agg.ntaCode)} had ${formatCount(
      top.value,
    )} residential noise complaints over ${ctx.windowLabel}, the most in the city.`,
  };
}

function cyclistIntersections(ctx: AgentContext): AgentReply {
  if (!ctx.crashes) return notReady();
  const window = crashWindowLabel(ctx);
  const rows = ctx.crashes.intersections
    .filter(
      (row) =>
        row.borough.toLowerCase() === "brooklyn" && row.cyclists > 0,
    )
    .slice(0, 5);

  if (rows.length === 0) {
    return {
      text: `No cyclist injuries were recorded at Brooklyn intersections in ${window}.`,
      toolCalls: [],
    };
  }

  const lines = rows.map(
    (row, index) =>
      `${index + 1}. ${row.label} — ${formatCount(row.cyclists)} cyclists injured across ${formatCount(row.crashes)} crashes`,
  );

  const ntaCodes = Array.from(
    new Set(rows.map((row) => row.ntaCode).filter((code): code is string => !!code)),
  );

  const text = [
    `${formatCount(rows[0].cyclists)} cyclists were injured at ${rows[0].label} over ${window} — the worst intersection in Brooklyn.`,
    "",
    ...lines,
  ].join("\n");

  const brooklyn = BOROUGH_CENTERS.brooklyn;
  const toolCalls: AgentToolCall[] = [
    { name: "set_layer", args: { layer: "crashes" } },
    { name: "highlight", args: { nta_codes: ntaCodes } },
    {
      name: "fly_to",
      args: { lat: brooklyn.lat, lon: brooklyn.lon, zoom: brooklyn.zoom, pitch: 50 },
    },
  ];

  return {
    text,
    toolCalls,
    spoken: `${formatCount(rows[0].cyclists)} cyclists were injured at ${rows[0].label} over ${window}, the worst intersection in Brooklyn.`,
  };
}

function manhattanCrashCause(ctx: AgentContext): AgentReply {
  if (!ctx.crashes) return notReady();
  const window = crashWindowLabel(ctx);
  const manhattan = ctx.crashes.boroughs.find(
    (borough) => borough.borough.toLowerCase() === "manhattan",
  );
  const top = manhattan?.factors[0];
  if (!manhattan || !top) {
    return {
      text: `No crash contributing factors were recorded for Manhattan in ${window}.`,
      toolCalls: [],
    };
  }

  const center = BOROUGH_CENTERS.manhattan;
  const text = [
    `“${top[0]}” is the top contributing factor in Manhattan: ${formatCount(top[1])} crashes over ${window}.`,
    `Manhattan recorded ${formatCount(manhattan.count)} crashes in that window, injuring ${formatCount(manhattan.injured)} people and killing ${formatCount(manhattan.killed)}.`,
  ].join(" ");

  return {
    text,
    toolCalls: [
      { name: "set_layer", args: { layer: "crashes" } },
      { name: "highlight", args: { nta_codes: [] } },
      {
        name: "fly_to",
        args: { lat: center.lat, lon: center.lon, zoom: center.zoom, pitch: 50 },
      },
    ],
    spoken: `In Manhattan the top crash cause is ${top[0]}, in ${formatCount(top[1])} crashes over ${window}.`,
  };
}

function helicopterAnswer(ctx: AgentContext): AgentReply {
  if (!ctx.noise || !ctx.boundaries) return notReady();
  const boundaries = ctx.boundaries;
  const nearby = boundaries.filter(
    (boundary) =>
      haversineKm(
        HELIPORT.lat,
        HELIPORT.lon,
        boundary.center[1],
        boundary.center[0],
      ) <= HELIPORT.radiusKm,
  );
  if (nearby.length === 0) {
    return {
      text: `I could not find neighborhoods within ${HELIPORT.radiusKm} km of the ${HELIPORT.name}.`,
      toolCalls: [],
    };
  }

  const codes = new Set(nearby.map((boundary) => boundary.ntaCode));
  const summer = lastSummerMonths(ctx.noise);
  const perMonth = new Map<string, number>();
  for (const nta of ctx.noise.ntas) {
    if (!codes.has(nta.ntaCode)) continue;
    for (const [month, value] of nta.helicopterMonths) {
      perMonth.set(month, (perMonth.get(month) ?? 0) + value);
    }
  }

  const available = summer.filter((month) => perMonth.has(month));
  const counted = available.reduce(
    (sum, month) => sum + (perMonth.get(month) ?? 0),
    0,
  );

  if (available.length === 0) {
    const windowTotal = ctx.noise.ntas
      .filter((nta) => codes.has(nta.ntaCode))
      .reduce((sum, nta) => sum + typeCount(nta, "Noise - Helicopter"), 0);
    return {
      text: `The last summer is outside the loaded window (${ctx.windowLabel}), so I can't count it month by month. Over the loaded window, ${formatCount(
        windowTotal,
      )} helicopter complaints were filed within ${HELIPORT.radiusKm} km of the ${HELIPORT.name}. Switch the time window to 12 months to cover last summer.`,
      toolCalls: [
        { name: "set_layer", args: { layer: "noise" } },
        {
          name: "highlight",
          args: { nta_codes: nearby.map((boundary) => boundary.ntaCode) },
        },
        {
          name: "fly_to",
          args: { lat: HELIPORT.lat, lon: HELIPORT.lon, zoom: 13.4, pitch: 55 },
        },
      ],
      spoken: `${formatCount(
        windowTotal,
      )} helicopter complaints near the heliport in the loaded window.`,
    };
  }

  const summerLabel =
    available.length === 3
      ? `Jun–Aug ${available[0].slice(0, 4)}`
      : `${available.join(", ")} (only these summer months are in the loaded window)`;

  const text = [
    `${formatCount(counted)} helicopter noise complaints were filed within ${HELIPORT.radiusKm} km of the ${HELIPORT.name} in ${summerLabel}.`,
    `Those ${nearby.length} neighborhoods (${nearby
      .map((boundary) => boundary.ntaName)
      .slice(0, 4)
      .join(", ")}) are highlighted on the map.`,
  ].join(" ");

  return {
    text,
    toolCalls: [
      { name: "set_layer", args: { layer: "noise" } },
      {
        name: "highlight",
        args: { nta_codes: nearby.map((boundary) => boundary.ntaCode) },
      },
      {
        name: "fly_to",
        args: { lat: HELIPORT.lat, lon: HELIPORT.lon, zoom: 13.4, pitch: 55 },
      },
    ],
    spoken: `${formatCount(counted)} helicopter noise complaints near the ${HELIPORT.name} in ${summerLabel}.`,
  };
}

function comparisonAnswer(ctx: AgentContext, place: string): AgentReply {
  if (!ctx.boundaries) return notReady();
  const boundary = findBoundary(ctx.boundaries, place);
  if (!boundary) {
    return {
      text: `I couldn't match “${place}” to a neighborhood. Try naming the NTA, for example “Bushwick South” or “East Village”.`,
      toolCalls: [],
    };
  }

  const noise = findAgg(ctx.noise, boundary.ntaCode);
  const crashes = findAgg(ctx.crashes, boundary.ntaCode);
  const value = layerCount(ctx.layer, noise, crashes);
  const metric = layerMetricLabel(ctx.layer);

  const boroughRows = ctx.boundaries.filter(
    (item) => item.borough === boundary.borough,
  );
  const boroughTotal =
    ctx.layer === "noise"
      ? ctx.noise?.boroughs.find((b) => b.borough === boundary.borough)?.count
      : ctx.layer === "crashes"
        ? ctx.crashes?.boroughs.find((b) => b.borough === boundary.borough)?.count
        : (ctx.noise?.boroughs.find((b) => b.borough === boundary.borough)?.count ??
            0) + (ctx.crashes?.boroughs.find((b) => b.borough === boundary.borough)?.count ?? 0);
  const average = boroughRows.length > 0 ? (boroughTotal ?? 0) / boroughRows.length : 0;
  const ratio = average > 0 ? value / average : 0;

  const nightShare = noise && noise.count > 0 ? noise.nightCount / noise.count : 0;

  const text = [
    `${boundary.ntaName}: ${formatCount(value)} ${metric} over ${ctx.windowLabel}.`,
    average > 0
      ? `That is ${ratio.toFixed(1)}× the ${boundary.borough} neighborhood average of ${formatCount(
          average,
        )}.`
      : "",
    ctx.layer !== "crashes" && noise
      ? `${formatPercent(nightShare)} of its noise complaints happen between 10pm and 4am.`
      : "",
    crashes && crashes.count > 0
      ? `${formatCount(crashes.count)} crashes injured ${formatCount(
          crashes.injured,
        )} people and killed ${formatCount(crashes.killed)} over ${crashWindowLabel(
          ctx,
        )}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    text,
    toolCalls: [
      { name: "set_layer", args: { layer: ctx.layer } },
      { name: "highlight", args: { nta_codes: [boundary.ntaCode] } },
      {
        name: "fly_to",
        args: {
          lat: boundary.center[1],
          lon: boundary.center[0],
          zoom: 13.8,
          pitch: 55,
        },
      },
    ],
    spoken: `${boundary.ntaName}: ${formatCount(value)} ${metric} over ${ctx.windowLabel}.`,
  };
}

function fallbackAnswer(ctx: AgentContext): AgentReply {
  const source = ctx.layer === "crashes" ? ctx.crashes : ctx.noise;
  if (!source || !ctx.boundaries) return notReady();
  const top = [...source.ntas].sort((a, b) => b.count - a.count)[0];
  if (!top) return notReady();
  const boundary = ctx.boundaries.find((b) => b.ntaCode === top.ntaCode);
  if (!boundary) return notReady();

  const window =
    ctx.layer === "crashes" ? crashWindowLabel(ctx) : ctx.windowLabel;

  const text = [
    `Right now the busiest neighborhood on the ${layerMetricLabel(
      ctx.layer,
    )} layer is ${boundary.ntaName} with ${formatCount(top.count)} over ${window}.`,
    "",
    "Try one of these:",
    "• Where is the loudest block in Bushwick on weekend nights?",
    "• Which 5 neighborhoods had the most residential noise complaints?",
    "• Which Brooklyn intersections have the most cyclist injuries?",
    "• What is the top crash cause in Manhattan?",
    "• How many helicopter noise complaints were there near the Downtown Manhattan Heliport?",
  ].join("\n");

  return {
    text,
    toolCalls: [
      { name: "highlight", args: { nta_codes: [boundary.ntaCode] } },
      {
        name: "fly_to",
        args: {
          lat: boundary.center[1],
          lon: boundary.center[0],
          zoom: 12.6,
          pitch: 52,
        },
      },
    ],
    spoken: `The busiest neighborhood on the ${layerMetricLabel(
      ctx.layer,
    )} layer is ${boundary.ntaName}, with ${formatCount(top.count)} over ${window}.`,
  };
}

interface Handler {
  test: (text: string) => boolean;
  run: (ctx: AgentContext, text: string) => AgentReply;
}

const HANDLERS: Handler[] = [
  {
    test: (text) => /bushwick/i.test(text),
    run: (ctx, text) =>
      bushwickAnswer(
        ctx,
        /weekend|saturday|friday|night/i.test(text),
      ),
  },
  {
    test: (text) => /residential/i.test(text),
    run: (ctx) => residentialRanking(ctx),
  },
  {
    test: (text) => /cyclist|bike|bicycl/i.test(text),
    run: (ctx) => cyclistIntersections(ctx),
  },
  {
    test: (text) => /helicopter|heliport/i.test(text),
    run: (ctx) => helicopterAnswer(ctx),
  },
  {
    test: (text) => /manhattan/i.test(text) && /cause|factor/i.test(text),
    run: (ctx) => manhattanCrashCause(ctx),
  },
  {
    test: (text) => /how does .+ compare/i.test(text),
    run: (ctx, text) => {
      const match = /how does (.+?) compare/i.exec(text);
      return comparisonAnswer(ctx, match?.[1]?.trim() ?? "");
    },
  },
];

/**
 * Deterministic stand-in for the real model. Every number is computed from the
 * loaded aggregates through the same query engine the tool executor uses, and
 * every answer emits real `fly_to` / `set_layer` / `highlight` calls.
 */
export class MockAgentClient implements AgentClient {
  async send(messages: ChatTurn[], context: AgentContext): Promise<AgentReply> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";

    // Small delay so the pending skeleton and the spoken reply feel natural.
    await new Promise((resolve) => setTimeout(resolve, 380));

    const handler = HANDLERS.find((candidate) => candidate.test(text));
    return handler ? handler.run(context, text) : fallbackAnswer(context);
  }
}
