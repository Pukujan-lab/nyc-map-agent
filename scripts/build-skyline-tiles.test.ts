import { describe, expect, it } from "vitest";
import { SKYLINE_MIN_M, SKYLINE_Z11_M, skylineFacade, skylineMinZoom } from "./build-skyline-tiles";

describe("skyline tiles", () => {
  it("shows supertalls from z11 and the rest of the skyline from z12", () => {
    expect(skylineMinZoom(SKYLINE_Z11_M + 1)).toBe(11);
    expect(skylineMinZoom(SKYLINE_MIN_M + 1)).toBe(12);
  });
  it("colours modern supertalls as glass and prewar towers as limestone", () => {
    expect(skylineFacade(300, 2014)).toBe("glass");
    expect(skylineFacade(380, 1931)).toBe("limestone");
    expect(skylineFacade(80, 1972)).toBe("tower");
  });
});
