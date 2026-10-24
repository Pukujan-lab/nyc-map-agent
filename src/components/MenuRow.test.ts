import { describe, expect, it } from "vitest";
import { rowOrder } from "./MenuRow";

describe("menu row order", () => {
  const items = ["myDay", "layers", "filters", "data", "cityData", "settings"].map((id) => ({ id }));
  it("puts the active menu first and wraps round in the fixed order", () => {
    expect(rowOrder(items, "data").map((i) => i.id)).toEqual(["data", "cityData", "settings", "myDay", "layers", "filters"]);
    expect(rowOrder(items, "settings").map((i) => i.id)).toEqual(["settings", "myDay", "layers", "filters", "data", "cityData"]);
  });
});
