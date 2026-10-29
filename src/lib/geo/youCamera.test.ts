import { describe, expect, it } from "vitest";
import { nextYouCamera } from "./youCamera";

describe("Center on my location taps", () => {
  it("follows, then turns with you, then goes back to north up", () => {
    expect(nextYouCamera("off", true)).toBe("follow");
    expect(nextYouCamera("follow", true)).toBe("turn");
    expect(nextYouCamera("turn", true)).toBe("follow");
  });
  it("stays following when the phone cannot tell which way you face", () => {
    expect(nextYouCamera("follow", false)).toBe("follow");
  });
});
