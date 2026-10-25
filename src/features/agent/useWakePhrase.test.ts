import { describe, expect, it } from "vitest";
import { afterWake } from "./useWakePhrase";

describe("afterWake", () => {
  it("hears the phrase in several languages", () => {
    expect(afterWake("hey map where is the bathroom")).toBe("where is the bathroom");
    expect(afterWake("oye mapa, dónde está el baño")).toBe("dónde está el baño");
    expect(afterWake("嘿地图，帝国大厦怎么走")).toBe("帝国大厦怎么走");
  });
  it("ignores speech without it", () => {
    expect(afterWake("the map is nice")).toBeNull();
  });
});
