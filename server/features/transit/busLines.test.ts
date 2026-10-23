import { describe, expect, it } from "vitest";
import { BUS_GROUPS } from "./busCatalog";
import { BUS_PAGE_CAP, filterBuses, pagesOf, parseBusRoutes } from "./busLines";

describe("bus pages", () => {
  it("pages a long list into groups of 20 and keeps route-number order", () => {
    const ids = ["Q2", "Q10", "Q1", "Q3", "Q11", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21"];
    const pages = pagesOf(ids, "queens");
    expect(pages.map((p) => p.id)).toEqual(["queens-1", "queens-2"]);
    expect(pages[0].routes).toHaveLength(BUS_PAGE_CAP);
    expect(pages[0].routes[0]).toBe("Q1");
    expect(pages[0].routes[1]).toBe("Q2");
    expect(pages[1].routes).toEqual(["Q21"]);
  });

  it("keeps each published page at 20 routes and leaves shuttle buses out", () => {
    const seen = new Set<string>();
    for (const g of BUS_GROUPS) {
      expect(g.pages.length).toBeGreaterThan(0);
      for (const p of g.pages) {
        expect(p.routes.length).toBeGreaterThan(0);
        expect(p.routes.length).toBeLessThanOrEqual(BUS_PAGE_CAP);
        for (const r of p.routes) {
          expect(seen.has(r)).toBe(false);
          seen.add(r);
          expect(r.startsWith("T")).toBe(false);
        }
      }
    }
    expect(seen.has("T102")).toBe(false);
    expect(seen.has("Q1")).toBe(true);
    expect(seen.has("QM1")).toBe(true);
    expect(seen.has("SIM1")).toBe(true);
    const queens = BUS_GROUPS.find((g) => g.id === "queens");
    expect(queens?.pages[0].routes.every((r) => r.startsWith("Q") && !r.startsWith("QM"))).toBe(true);
  });

  it("rejects more than one page of routes and filters the fleet to the list", () => {
    expect(parseBusRoutes(null)).toBeNull();
    expect(parseBusRoutes("q44+,m15+")).toEqual(["Q44+", "M15+"]);
    expect(parseBusRoutes("nope")).toBe("bad");
    expect(parseBusRoutes(Array.from({ length: 21 }, (_, i) => `Q${i + 1}`).join(","))).toBe("bad");
    const buses = [{ route: "Q1" }, { route: "q44+" }, { route: "M15" }];
    expect(filterBuses(buses, ["Q44+"])).toEqual([{ route: "q44+" }]);
  });
});
