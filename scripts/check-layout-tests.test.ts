import { describe, expect, it } from "vitest";
import { gate, isScreen } from "./check-layout-tests";

const files: Record<string, string> = {
  "e2e/responsive.spec.ts": "await expectLayout(page);",
  "e2e/other.spec.ts": "await expect(page).toBeVisible();",
};
const read = (p: string) => {
  if (!(p in files)) throw new Error("gone");
  return files[p];
};

describe("layout test gate", () => {
  it("counts components and stylesheets as screens, not tests", () => {
    expect(isScreen("src/components/MapChrome.tsx")).toBe(true);
    expect(isScreen("src/index.css")).toBe(true);
    expect(isScreen("src/components/MapChrome.test.tsx")).toBe(false);
    expect(isScreen("src/lib/map/stairs.ts")).toBe(false);
  });
  it("passes when nothing on screen changed", () => {
    expect(gate(["src/lib/map/stairs.ts", "docs/PDD.md"], read).ok).toBe(true);
  });
  it("fails a screen change without a layout spec", () => {
    expect(gate(["src/components/MapChrome.tsx", "e2e/other.spec.ts"], read)).toEqual({ ok: false, screens: ["src/components/MapChrome.tsx"] });
  });
  it("passes a screen change that touches a spec calling expectLayout", () => {
    expect(gate(["src/components/MapChrome.tsx", "e2e/responsive.spec.ts"], read).ok).toBe(true);
  });
  it("does not count a deleted spec", () => {
    expect(gate(["src/components/MapChrome.tsx", "e2e/gone.spec.ts"], read).ok).toBe(false);
  });
});
