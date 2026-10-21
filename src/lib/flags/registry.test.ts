import { describe, expect, it } from "vitest";
import { parseOverrides, resolveFlags } from "./registry";

describe("flags", () => {
  it("parses overrides and ignores unknown ids", () => {
    expect(parseOverrides("-restrooms,+crashes,bogus")).toEqual({ restrooms: false, crashes: true });
  });
  it("hides advanced flags in simple mode", () => {
    const f = resolveFlags({ advancedMode: false });
    expect(f.noise).toBe(true);
    expect(f.crashes).toBe(false);
    expect(f.dataLayers).toBe(false);
  });
  it("advanced mode shows them; URL beats env", () => {
    const f = resolveFlags({ advancedMode: true, env: "-crashes", url: "+crashes,-restrooms" });
    expect(f.crashes).toBe(true);
    expect(f.restrooms).toBe(false);
  });
});
