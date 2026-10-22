import { describe, expect, it } from "vitest";
import { parseSunOverride, sunLight } from "./sun";

describe("sun", () => {
  it("parses ?time and ?date in New York time (DST aware)", () => {
    expect(parseSunOverride("?time=14:00&date=2026-10-22")?.toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(parseSunOverride("?time=09:30&date=2026-01-15")?.toISOString()).toBe("2026-01-15T14:30:00.000Z");
    expect(parseSunOverride("?time=25:00")).toBeNull();
    expect(parseSunOverride("")).toBeNull();
  });
  it("is strong at midday, warm and weak at golden hour, off at night", () => {
    const noon = sunLight(parseSunOverride("?time=13:00&date=2026-06-21")!);
    expect(noon.strength).toBeGreaterThan(0.95);
    expect(noon.dir[1]).toBeGreaterThan(0.9);
    const late = sunLight(parseSunOverride("?time=18:00&date=2026-10-22")!);
    expect(late.color[2]).toBeLessThan(0.8);
    expect(sunLight(parseSunOverride("?time=23:00&date=2026-10-22")!).strength).toBe(0);
    expect(sunLight(parseSunOverride("?time=13:00&date=2026-06-21")!, "cloudy").strength).toBeLessThan(0.5);
  });
  it("puts the afternoon sun in the south-west", () => {
    const { dir } = sunLight(parseSunOverride("?time=15:00&date=2026-10-22")!);
    expect(dir[0]).toBeLessThan(0); // west
    expect(dir[2]).toBeGreaterThan(0); // south
  });
});
