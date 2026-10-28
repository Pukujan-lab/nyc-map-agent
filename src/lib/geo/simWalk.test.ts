import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metres } from "@/lib/map/mapRead";
import { along, buildSimWalk, simRequested } from "./simWalk";

const subway = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Parameters<typeof buildSimWalk>[0];

describe("pretend trip", () => {
  const walk = buildSimWalk(subway);

  it("starts in Union Square Park and ends at the Bryant Park restroom", () => {
    expect(metres(walk[0].at, [-73.9904, 40.7362])).toBeLessThan(1);
    expect(metres(walk.at(-1)!.at, [-73.9833, 40.7538])).toBeLessThan(1);
  });

  it("is weak below ground and sharp on the street", () => {
    const accs = walk.map((s) => s.accuracy);
    expect(Math.max(...accs)).toBeGreaterThanOrEqual(100);
    expect(walk[0].accuracy).toBeLessThan(15);
    expect(walk.at(-1)!.accuracy).toBeLessThan(15);
  });

  it("rides uptown on the 6 and never jumps between samples", () => {
    const below = walk.filter((s) => s.accuracy >= 100);
    expect(below.at(-1)!.at[1]).toBeGreaterThan(below[0].at[1] + 0.015);
    for (let i = 1; i < walk.length; i++) expect(metres(walk[i - 1].at, walk[i].at)).toBeLessThan(80);
  });

  it("says which way you are going while moving", () => {
    const moving = walk.filter((s) => s.speed > 0);
    expect(moving.length).toBeGreaterThan(50);
    expect(moving.every((s) => s.course !== null && s.course >= 0 && s.course < 360)).toBe(true);
  });

  it("takes about two minutes to play", () => {
    expect(walk.length * 0.5).toBeGreaterThan(60);
    expect(walk.length * 0.5).toBeLessThan(240);
  });
});

describe("along", () => {
  it("steps evenly and ends on the last point", () => {
    const pts = along([[-73.99, 40.73], [-73.99, 40.731]], 10);
    expect(pts.at(-1)).toEqual([-73.99, 40.731]);
    expect(pts.length).toBe(13);
  });
});

it("only ?sim=walk asks for the pretend trip", () => {
  expect(simRequested("?sim=walk")).toBe(true);
  expect(simRequested("?a=1&sim=walk")).toBe(true);
  expect(simRequested("?sim=1")).toBe(false);
  expect(simRequested("")).toBe(false);
});
