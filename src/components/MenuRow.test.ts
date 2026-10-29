import { describe, expect, it } from "vitest";
import { MENU_ALPHA, MENU_IDS, MENU_SIZE, pressMenu, rowOrder, type MenuId } from "./MenuRow";

describe("menu row order", () => {
  const items = MENU_IDS.map((id) => ({ id }));
  it("puts the active menu first and wraps round in the fixed order", () => {
    expect(MENU_IDS).toEqual(["myDay", "layers", "filters", "data", "cityData", "settings"]);
    expect(rowOrder(items, "data").map((i) => i.id)).toEqual(["data", "cityData", "settings", "myDay", "layers", "filters"]);
    expect(rowOrder(items, "settings").map((i) => i.id)).toEqual(["settings", "myDay", "layers", "filters", "data", "cityData"]);
  });

  it("keeps the icons after the pill equal and at full strength", () => {
    expect(MENU_SIZE).toEqual([44, 36, 36, 36, 36, 36]);
    expect(MENU_ALPHA).toEqual([1, 1, 1, 1, 1, 1]);
    expect(MENU_SIZE).toHaveLength(MENU_IDS.length);
  });

  it("makes a tapped icon the active pill with its dropdown open, and toggles the pill", () => {
    expect(pressMenu("myDay", null, "layers")).toEqual({ active: "layers", open: "layers" });
    expect(pressMenu("layers", "layers", "data")).toEqual({ active: "data", open: "data" });
    expect(pressMenu("data", "data", "data")).toEqual({ active: "data", open: null });
    expect(pressMenu("data", null, "data")).toEqual({ active: "data", open: "data" });
    const ids: MenuId[] = ["myDay", "layers", "filters", "data", "cityData", "settings"];
    let active: MenuId = "myDay";
    let open: MenuId | null = null;
    for (const id of ids) {
      ({ active, open } = pressMenu(active, open, id));
      expect(active).toBe(id);
      expect(open).toBe(id);
      expect(rowOrder(items, active)[0].id).toBe(id);
    }
  });
});
