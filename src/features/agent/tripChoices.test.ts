import { describe, expect, it } from "vitest";
import { tripChoiceQuestion } from "./tripChoices";

const trip = { origin: { label: "your location", at: [-73.88, 40.74] as [number, number] }, destination: { label: "Rockefeller Center", at: [-73.9787, 40.758741] as [number, number] } };

describe("tripChoiceQuestion", () => {
  it("asks again for the same two ends, with the choice said plainly", () => {
    expect(tripChoiceQuestion(trip, "bus")).toBe("By bus only, from here to Rockefeller Center (40.75874, -73.97870).");
    expect(tripChoiceQuestion(trip, "less-walking")).toBe("The way with the least walking, from here to Rockefeller Center (40.75874, -73.97870).");
  });
});
