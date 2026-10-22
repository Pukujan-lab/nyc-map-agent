import { describe, expect, it } from "vitest";
import { serviceChanges } from "../../../src/lib/transit/serviceChanges";
import { avoidFor, platformNotes } from "./trip";
import type { Station } from "./transit";

const st = (name: string, lon: number): Station => ({ id: name, complexId: name, name, routes: ["7"], structure: "Elevated", at: [lon, 40.745] });
const flushing = st("Flushing-Main St", -73.83), s69 = st("69 St", -73.896), s52 = st("52 St", -73.912), woodside = st("61 St-Woodside", -73.903), qbp = st("Queensboro Plaza", -73.94);
const all = [flushing, s69, s52, woodside, qbp];
const changes = serviceChanges({ id: "a", routes: ["7"], text: "In Queens, Flushing-bound [7] skips 52 St and 69 St\nAll trains at Woodside-61 St board from the Manhattan-bound platform" });

describe("trip planning around direction-aware skips", () => {
  const avoid = avoidFor(changes, all);
  it("avoids 69 St and 52 St for Flushing-bound rides", () => {
    expect(avoid(s69, "7", qbp, s69)).toBe(true); // exit at 69 St heading to Flushing
    expect(avoid(s52, "7", s52, flushing)).toBe(true); // board at 52 St heading to Flushing
  });
  it("keeps them for Manhattan-bound rides", () => {
    expect(avoid(s69, "7", s69, qbp)).toBe(false);
    expect(avoid(s52, "7", flushing, s52)).toBe(false);
  });
  it("adds the platform notice only for the moved direction at Woodside", () => {
    expect(platformNotes(changes, woodside, "7", woodside, flushing, all)).toEqual(["Flushing-bound trains board from the Manhattan-bound platform"]);
    expect(platformNotes(changes, woodside, "7", woodside, qbp, all)).toEqual([]);
  });
});
