import { describe, expect, it } from "vitest";
import { parseOverrides, resolveFlags } from "./registry";

describe("flags", () => {
  it("parses overrides and ignores unknown ids", () => {
    expect(parseOverrides("-restrooms,+crashes,bogus")).toEqual({ restrooms: false, crashes: true });
  });
  it("hides advanced flags in simple mode", () => {
    const f = resolveFlags({ advancedMode: false });
    expect(f.noise).toBe(false);
    expect(f.crashes).toBe(false);
    expect(f.dataLayers).toBe(false);
  });
  it("advanced mode shows them; URL beats env", () => {
    const f = resolveFlags({ advancedMode: true, env: "-crashes", url: "+crashes,-restrooms" });
    expect(f.crashes).toBe(true);
    expect(f.restrooms).toBe(false);
  });
  it("a saved view= link keeps noise and crashes working in simple mode", () => {
    const f = resolveFlags({ advancedMode: false, analyticsLink: true });
    expect(f.noise).toBe(true);
    expect(f.crashes).toBe(true);
    expect(f.feedHealth).toBe(false);
  });
});

describe("transit-first first open", () => {
  it("keeps flood alerts and analytics behind Advanced", () => {
    const simple = resolveFlags({ advancedMode: false });
    for (const id of ["hazards", "noise", "crashes", "combined", "dataLayers"] as const) expect(simple[id]).toBe(false);
    expect(simple.transit).toBe(true);
    expect(simple.restrooms).toBe(true);
    expect(resolveFlags({ advancedMode: true }).hazards).toBe(true);
  });
});

describe("detailed 3D city is optional (#363)", () => {
  it("is off by default, in simple and in advanced mode", () => {
    expect(resolveFlags({ advancedMode: false }).detailedCity).toBe(false);
    expect(resolveFlags({ advancedMode: true }).detailedCity).toBe(false);
  });
  it("turns on only in advanced mode, from the URL or the build env", () => {
    expect(resolveFlags({ advancedMode: true, url: "+detailedCity" }).detailedCity).toBe(true);
    expect(resolveFlags({ advancedMode: true, env: "+detailedCity" }).detailedCity).toBe(true);
    expect(resolveFlags({ advancedMode: false, url: "+detailedCity" }).detailedCity).toBe(false);
  });
});
