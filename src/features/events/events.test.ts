import { describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/features";
import { FLAGS, resolveFlags } from "@/lib/flags/registry";
import { eventChips } from "./chips";
import { pinAt, type EventFeature } from "./data";
import { toCollections } from "./eventsLayers";
import { formatWhen, isHappeningNow, windowRange } from "./window";

vi.mock("@/lib/store/PanelContext", () => ({ pushPanel: vi.fn() }));

describe("Events toggle", () => {
  const mod = FEATURES.find((f) => f.id === "events")!;
  it("is registered behind its own flag, with an Events chip in Layers & filters", () => {
    expect(mod).toBeDefined();
    expect(FLAGS.events.tier).toBe("basic");
    expect(mod.flags[0]).toBe("events");
    expect(mod.chip).toEqual({ id: "events", label: "Events" });
    expect(resolveFlags({ url: "-events", advancedMode: false }).events).toBe(false);
  });
  it("is hidden by default: its layers mount only once the chip is toggled on", () => {
    // Same rule MapView uses for chip features.
    const mounted = (on: Set<string>) => !!mod.layers && (!mod.chip || on.has(mod.chip.id));
    expect(mounted(new Set())).toBe(false);
    expect(mounted(new Set(["events"]))).toBe(true);
  });
  it("shows Today / This weekend chips only while the layer is on, one at a time", () => {
    expect(eventChips(false, "week", () => {})).toEqual([]);
    const set = vi.fn();
    const [today, weekend] = eventChips(true, "today", set);
    expect([today.label, weekend.label]).toEqual(["Events today", "Events this weekend"]);
    expect([today.active, weekend.active]).toEqual([true, false]);
    today.onToggle();
    expect(set).toHaveBeenLastCalledWith("week");
    weekend.onToggle();
    expect(set).toHaveBeenLastCalledWith("weekend");
  });
});

describe("time windows (New York days)", () => {
  const wed = new Date("2026-10-21T20:00:00-04:00");
  it("today runs to New York midnight", () => {
    expect(windowRange("today", wed).to.toISOString()).toBe("2026-10-22T04:00:00.000Z");
  });
  it("this weekend is Saturday 00:00 to Monday 00:00", () => {
    const r = windowRange("weekend", wed);
    expect(r.from.toISOString()).toBe("2026-10-24T04:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });
  it("on Sunday, the weekend starts now", () => {
    const sun = new Date("2026-10-25T11:00:00-04:00");
    expect(windowRange("weekend", sun).from).toEqual(sun);
    expect(windowRange("weekend", sun).to.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });
  it("crosses the November DST change", () => {
    const sat = new Date("2026-10-31T12:00:00-04:00");
    expect(windowRange("weekend", sat).to.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
  it("formats times and happening-now", () => {
    expect(formatWhen("2026-10-21T15:00:00-04:00", "2026-10-21T18:30:00-04:00", wed)).toBe("Today · 3 PM–6:30 PM");
    expect(isHappeningNow("2026-10-21T19:00:00-04:00", "2026-10-21T21:00:00-04:00", wed.getTime())).toBe(true);
    expect(isHappeningNow("2026-10-22T19:00:00-04:00", "2026-10-22T21:00:00-04:00", wed.getTime())).toBe(false);
  });
});

describe("pins", () => {
  const line: EventFeature = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[-73.9535, 40.6673], [-73.9507, 40.6671]] },
    properties: { id: "permitted:1", title: "Fair", kind: "fair", start: "2026-10-21T19:00:00-04:00", end: "2026-10-21T22:00:00-04:00", address: null, source: "nyc-permitted-events", url: null },
  };
  it("puts a block's pin mid-block and flags happening-now", () => {
    const [lon, lat] = pinAt(line);
    expect(lon).toBeCloseTo(-73.9521, 6);
    expect(lat).toBeCloseTo(40.6672, 6);
    const { pins, lines } = toCollections([line], Date.parse("2026-10-21T20:00:00-04:00"));
    expect(pins.features[0].properties).toMatchObject({ id: "permitted:1", now: true });
    expect(lines.features).toHaveLength(1);
  });
});
