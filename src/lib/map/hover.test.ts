import { describe, expect, it } from "vitest";
import { hoverBlocked } from "./hover";

const base = { drawerOpen: false, content: false, minimized: false, selected: false };
describe("hover card", () => {
  it("shows on a bare map", () => expect(hoverBlocked(base)).toBe(false));
  it("hides while the drawer is open", () => expect(hoverBlocked({ ...base, drawerOpen: true })).toBe(true));
  it("hides while a sheet is open", () => {
    expect(hoverBlocked({ ...base, content: true })).toBe(true);
    expect(hoverBlocked({ ...base, selected: true })).toBe(true);
  });
  it("returns once the sheet is minimized", () => expect(hoverBlocked({ ...base, content: true, minimized: true })).toBe(false));
});
