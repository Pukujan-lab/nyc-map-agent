import { describe, expect, it } from "vitest";
import { groupBusRoutes } from "./busGroups";

describe("bus routes grouped for picking", () => {
  it("splits Bx from B and the express prefixes from their borough, in number order", () => {
    const g = groupBusRoutes(["Q113", "Q1", "Q10", "BX12", "B41", "BXM2", "QM2", "M4", "SIM1C", "SIM10", "X27", "S53", "BM3"]);
    expect([...g.keys()]).toEqual(["M", "Bx", "B", "Q", "S", "QM", "BM", "BxM", "X", "SIM"]);
    expect(g.get("Q")).toEqual(["Q1", "Q10", "Q113"]);
    expect(g.get("Bx")).toEqual(["BX12"]);
    expect(g.get("SIM")).toEqual(["SIM1C", "SIM10"]);
  });

  it("leaves out groups with no routes", () => {
    expect([...groupBusRoutes(["M15+", "M15"]).entries()]).toEqual([["M", ["M15", "M15+"]]]);
  });
});

describe("bus paint by route", () => {
  it("SBS routes end in +, express are QM/BM/BxM/X/SIM, the rest are local", async () => {
    const { busLivery } = await import("./bullets");
    expect(["M15+", "B44+", "QM2", "BXM1", "X27", "SIM1C", "B62", "Q58", "M4"].map(busLivery)).toEqual(["sbs", "sbs", "express", "express", "express", "express", "local", "local", "local"]);
  });
});
