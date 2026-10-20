import { describe, expect, it } from "vitest";
import type { NtaBoundary, PolygonRings } from "@/lib/api/nta";
import type { AggregateResult, NtaAggregate } from "@/lib/geo/types";
import type { AgentContext } from "./client";
import { MockAgentClient } from "./mockAgent";

const square: PolygonRings = [
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ],
];

function boundary(
  code: string,
  name: string,
  borough: string,
  center: [number, number] = [-73.94, 40.7],
): NtaBoundary {
  return {
    ntaCode: code,
    ntaName: name,
    borough,
    bbox: [center[0] - 0.01, center[1] - 0.01, center[0] + 0.01, center[1] + 0.01],
    center,
    polygons: [square],
  };
}

function nta(code: string, overrides: Partial<NtaAggregate> = {}): NtaAggregate {
  return {
    ntaCode: code,
    count: 0,
    nightCount: 0,
    weekendNightCount: 0,
    hours: new Array<number>(24).fill(0),
    months: [],
    helicopterMonths: [],
    topTypes: [],
    topDescriptors: [],
    topFactors: [],
    injured: 0,
    killed: 0,
    cyclists: 0,
    pedestrians: 0,
    severity: 0,
    ...overrides,
  };
}

function aggregate(
  dataset: "noise" | "crashes",
  ntas: NtaAggregate[],
  extra: Partial<AggregateResult> = {},
): AggregateResult {
  return {
    dataset,
    windowId: "90d",
    windowStart: "2026-07-21T00:00:00",
    windowEnd: "2026-10-19T23:59:59",
    generatedAt: "2026-10-19T00:00:00.000Z",
    totalRows: ntas.reduce((sum, item) => sum + item.count, 0),
    unassignedCount: 4,
    malformedCount: 0,
    ntas,
    blocks: [],
    boroughs: [],
    intersections: [],
    sources: [{ label: "source", query: "https://example.test" }],
    ...extra,
  };
}

const boundaries: NtaBoundary[] = [
  boundary("BK0501", "Bushwick North", "Brooklyn"),
  boundary("BK0502", "Bushwick South", "Brooklyn"),
  boundary("BK0503", "Bedford-Stuyvesant", "Brooklyn"),
  boundary("MN0101", "East Village", "Manhattan"),
  boundary("MN0201", "Financial District", "Manhattan", [-73.9865, 40.7012]),
];

const noise = aggregate("noise", [
  nta("BK0501", {
    count: 400,
    nightCount: 160,
    weekendNightCount: 120,
    months: [["2026-06", 100], ["2026-07", 150], ["2026-08", 150]],
    helicopterMonths: [["2026-06", 3], ["2026-07", 5], ["2026-08", 2]],
    topTypes: [
      ["Noise - Residential", 250],
      ["Noise - Helicopter", 10],
    ],
    topDescriptors: [["Loud Music/Party", 90]],
  }),
  nta("BK0502", {
    count: 700,
    nightCount: 280,
    weekendNightCount: 300,
    months: [["2026-07", 400], ["2026-08", 300]],
    helicopterMonths: [["2026-07", 1]],
    topTypes: [
      ["Noise - Residential", 500],
      ["Noise - Helicopter", 1],
    ],
    topDescriptors: [["Loud Talking", 200]],
  }),
  nta("BK0503", {
    count: 300,
    months: [["2026-07", 300]],
    topTypes: [["Noise - Residential", 180]],
  }),
  nta("MN0101", {
    count: 200,
    months: [["2026-07", 200]],
    topTypes: [["Noise - Residential", 120]],
  }),
  nta("MN0201", {
    count: 100,
    months: [
      ["2026-06", 30],
      ["2026-07", 40],
      ["2026-08", 30],
    ],
    helicopterMonths: [
      ["2026-06", 10],
      ["2026-07", 20],
      ["2026-08", 10],
    ],
    topTypes: [
      ["Noise - Residential", 20],
      ["Noise - Helicopter", 40],
    ],
  }),
]);

const crashes = aggregate(
  "crashes",
  [
    nta("BK0501", { count: 30, injured: 12, killed: 1, severity: 66 }),
    nta("BK0502", { count: 50, injured: 20, killed: 2, severity: 110 }),
    nta("MN0101", { count: 40, injured: 10, severity: 70 }),
  ],
  {
    boroughs: [
      {
        borough: "Manhattan",
        count: 40,
        injured: 10,
        killed: 0,
        cyclists: 2,
        factors: [
          ["Driver Inattention/Distraction", 18],
          ["Failure to Yield Right-of-Way", 9],
        ],
      },
      {
        borough: "Brooklyn",
        count: 80,
        injured: 32,
        killed: 3,
        cyclists: 6,
        factors: [["Driver Inattention/Distraction", 30]],
      },
    ],
    intersections: [
      {
        label: "BEDFORD AVE & ATLANTIC AVE",
        onStreet: "BEDFORD AVE",
        crossStreet: "ATLANTIC AVE",
        ntaCode: "BK0503",
        borough: "Brooklyn",
        crashes: 12,
        cyclists: 6,
        injured: 9,
        killed: 0,
      },
      {
        label: "BROADWAY & CANAL ST",
        onStreet: "BROADWAY",
        crossStreet: "CANAL ST",
        ntaCode: "MN0101",
        borough: "Manhattan",
        crashes: 20,
        cyclists: 3,
        injured: 14,
        killed: 1,
      },
    ],
  },
);

const context: AgentContext = {
  layer: "noise",
  windowId: "90d",
  windowLabel: "the last 90 days",
  boundaries,
  noise,
  crashes,
};

async function ask(question: string): Promise<ReturnType<MockAgentClient["send"]>> {
  const client = new MockAgentClient();
  return client.send([{ role: "user", content: question }], context);
}

describe("MockAgentClient acceptance questions", () => {
  it("answers the Bushwick weekend-night question from the aggregate", async () => {
    const reply = await ask(
      "Where is the loudest block in Bushwick on weekend nights (10pm to 4am)?",
    );
    expect(reply.text).toContain("300");
    expect(reply.text).toContain("Bushwick South");
    expect(reply.toolCalls.some((call) => call.name === "highlight")).toBe(true);
    expect(reply.toolCalls.some((call) => call.name === "fly_to")).toBe(true);
  });

  it("ranks the top 5 neighborhoods by residential noise", async () => {
    const reply = await ask(
      "Which 5 neighborhoods had the most residential noise complaints in the last 90 days?",
    );
    expect(reply.text).toContain("Bushwick South");
    expect(reply.text).toContain("500");
    const highlight = reply.toolCalls.find((call) => call.name === "highlight");
    expect(highlight?.name === "highlight" && highlight.args.nta_codes?.length).toBe(5);
  });

  it("lists Brooklyn intersections by cyclist injuries", async () => {
    const reply = await ask("Which Brooklyn intersections have the most cyclist injuries?");
    expect(reply.text).toContain("BEDFORD AVE & ATLANTIC AVE");
    expect(reply.text).toContain("6");
    expect(reply.text).not.toContain("BROADWAY & CANAL ST");
  });

  it("names the top Manhattan crash cause", async () => {
    const reply = await ask(
      "What is the top crash cause in Manhattan, and how many crashes did it cause?",
    );
    expect(reply.text).toContain("Driver Inattention/Distraction");
    expect(reply.text).toContain("18");
  });

  it("counts helicopter complaints near the heliport for last summer", async () => {
    const reply = await ask(
      "How many helicopter noise complaints were there near the Downtown Manhattan Heliport last summer?",
    );
    expect(reply.text).toContain("40");
    expect(reply.text).toContain("Jun–Aug 2026");
  });

  it("falls back without inventing a number", async () => {
    const reply = await ask("What is the best pizza in Queens?");
    expect(reply.text).toContain("Try one of these");
    expect(reply.toolCalls.length).toBeGreaterThan(0);
  });
});

describe("MockAgentClient free-form questions", () => {
  it("rolls a plain question up to the borough level", async () => {
    const reply = await ask("Which borough had the most noise complaints?");
    expect(reply.text).toContain("Brooklyn");
    expect(reply.text).toContain("1,400");
    expect(reply.toolCalls.some((call) => call.name === "fly_to")).toBe(true);
  });

  it("answers for a named neighborhood instead of ranking the city", async () => {
    const reply = await ask(
      "How many noise complaints were there in East Village in the last 90 days?",
    );
    expect(reply.text).toContain("East Village");
    expect(reply.text).toContain("200");
    expect(reply.text).not.toContain("Bushwick South");
  });

  it("honours a stated count and switches to the crash layer", async () => {
    const reply = await ask("Which 3 neighborhoods had the most crashes?");
    expect(reply.text).toContain("Bushwick South");
    expect(reply.text).toContain("50");
    const highlight = reply.toolCalls.find((call) => call.name === "highlight");
    expect(highlight?.name === "highlight" && highlight.args.nta_codes?.length).toBe(3);
    expect(reply.toolCalls.some((call) => call.name === "set_layer")).toBe(true);
  });

  it("ranks ascending for a fewest question", async () => {
    const reply = await ask("Which neighborhood had the fewest noise complaints?");
    expect(reply.text).toContain("Financial District");
    expect(reply.text).toContain("100");
  });

  it("refuses to fake a noise intersection rollup", async () => {
    const reply = await ask("Which intersections have the most noise complaints?");
    expect(reply.text).toContain("only build intersection rollups from crash data");
    expect(reply.text).not.toContain("0 noise complaints");
  });
});
