import { describe, expect, it } from "vitest";
import { followUpQuestion } from "./followUpQuestion";
describe("answer follow-up questions", () => {
  it("asks for map context without adding food or shopping requests", () => {
    for (const place of [null, { name: "Bryant Park", lon: -73.983, lat: 40.754 }]) {
      const q = followUpQuestion("nearby", place);
      expect(q).toContain("landmarks, public restrooms and transit stops");
      expect(q).not.toMatch(/food|caf[eé]|shop/i);
    }
  });
  it("keeps the selected place for nearby and asks for alternatives", () => {
    expect(followUpQuestion("nearby", { name: "Bryant Park", lon: -73.983, lat: 40.754 })).toContain("near Bryant Park (40.7540, -73.9830)");
    expect(followUpQuestion("other", null)).toContain("other options");
  });
});
