import { describe, expect, it } from "vitest";
import { EMPTY_SLOT, escapeTarget, peekChipLabel, sheetSnapFor, slotReducer, type SlotState } from "./panelSlot";

const run = (s: SlotState, ...types: Parameters<typeof slotReducer>[1]["type"][]) =>
  types.reduce((acc, type) => slotReducer(acc, { type } as never), s);

describe("panel slot", () => {
  it("a train tap (showSheet) closes the drawer", () => {
    const s = run(EMPTY_SLOT, "openDrawer", "showSheet");
    expect(s).toEqual({ drawerOpen: false, sheet: true, minimized: false });
  });

  it("never shows drawer and sheet together on screen", () => {
    const s = run(EMPTY_SLOT, "showSheet", "openDrawer");
    // the sheet is kept but hidden behind the drawer until it closes
    expect(s.drawerOpen && s.sheet).toBe(true);
    expect(run(s, "closeDrawer")).toEqual({ drawerOpen: false, sheet: true, minimized: false });
  });

  it("an empty tap leaves the layers drawer open and closes a details sheet", () => {
    expect(run(EMPTY_SLOT, "showSheet", "openDrawer", "emptyTap")).toEqual({ drawerOpen: true, sheet: true, minimized: false });
    expect(run(EMPTY_SLOT, "showSheet", "emptyTap")).toEqual(EMPTY_SLOT);
  });

  it("minimize makes a peek chip and restore brings the sheet back", () => {
    const s = run(EMPTY_SLOT, "showSheet", "minimize");
    expect(s.minimized).toBe(true);
    expect(run(s, "restore").minimized).toBe(false);
    expect(peekChipLabel("Q train", "Q · 2 min")).toBe("Q · 2 min");
    expect(peekChipLabel("Q train")).toBe("Q train");
  });

  it("opens the lines list at half height and leaves follow at a peek", () => {
    expect(sheetSnapFor("transit:lines", false)).toBe("half");
    expect(sheetSnapFor("transit:lines", true)).toBe("half");
    expect(sheetSnapFor("transit:station:subway:127", true)).toBe("peek");
    expect(sheetSnapFor(null, false)).toBeNull();
  });

  it("Esc/Back order: drawer, then sheet, then the active mode", () => {
    let s = run(EMPTY_SLOT, "showSheet", "openDrawer");
    expect(escapeTarget(s, true)).toBe("drawer");
    s = run(s, "dismissTop");
    expect(escapeTarget(s, true)).toBe("sheet");
    s = run(s, "dismissTop");
    expect(escapeTarget(s, true)).toBe("mode");
    expect(escapeTarget(s, false)).toBeNull();
  });
});
