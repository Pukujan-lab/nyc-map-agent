import { describe, expect, it } from "vitest";
import { bulletFace, bulletId, busBadgeId, busPrefix } from "./bullets";

describe("route bullets", () => {
  it("label locals, expresses and shuttles", () => {
    expect(bulletFace("A")).toEqual({ text: "A", express: false, darkText: false });
    expect(bulletFace("6X")).toEqual({ text: "6", express: true, darkText: false });
    expect(bulletFace("GS").text).toBe("S");
  });
  it("use black text on the yellow lines", () => {
    expect(["N", "Q", "R", "W"].every((r) => bulletFace(r).darkText)).toBe(true);
    expect(bulletFace("L").darkText).toBe(false);
  });
  it("key images by route and colour", () => {
    expect(bulletId("Q", "#FCCC0A")).toBe("bullet|Q|FCCC0A|0");
    expect(bulletId("A", "#0039A6", true)).toBe("bullet|A|0039A6|1");
  });
});

describe("bus badges", () => {
  it("shows the borough prefix zoomed out, express flagged", () => {
    expect(busPrefix("M42")).toEqual({ text: "M", express: false });
    expect(busPrefix("Bx12")).toEqual({ text: "Bx", express: false });
    expect(busPrefix("BX12+")).toEqual({ text: "Bx", express: false });
    expect(busPrefix("B44+")).toEqual({ text: "B", express: false });
    expect(busPrefix("Q10")).toEqual({ text: "Q", express: false });
    expect(busPrefix("S79+")).toEqual({ text: "S", express: false });
    for (const [r, t] of [["BM3", "BM"], ["QM2", "QM"], ["BXM1", "BxM"], ["X27", "X"], ["SIM1C", "SIM"]]) expect(busPrefix(r)).toEqual({ text: t, express: true });
  });
  it("encodes text, colour and alert in the image id", () => {
    expect(busBadgeId("M42", "#5F6B7A", true)).toBe("busbadge|M42|5F6B7A|1");
    expect(busBadgeId("M", "#5F6B7A")).toBe("busbadge|M|5F6B7A|0");
  });
});
