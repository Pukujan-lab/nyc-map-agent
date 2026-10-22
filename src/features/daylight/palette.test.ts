import { describe, expect, it } from "vitest";
import { effectiveLighting } from "./palette";

describe("daylight vs explicit theme (#3)", () => {
  it("only Auto follows the clock", () => {
    expect(effectiveLighting("auto", "auto")).toBe("auto");
    expect(effectiveLighting("auto", "ivory")).toBe("day");
    expect(effectiveLighting("auto", "ink")).toBe("day");
  });
  it("an explicit Lighting pick still applies", () => {
    expect(effectiveLighting("night", "ivory")).toBe("night");
  });
});
