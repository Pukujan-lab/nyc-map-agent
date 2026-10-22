import { describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/features";
import { FLAGS } from "@/lib/flags/registry";
import { ACCESS_LABEL, MIN_ZOOM } from "./data";
import { isShopsEnabled, setShopsEnabled, subscribeShops } from "./store";

vi.mock("@/lib/store/PanelContext", () => ({ pushPanel: vi.fn() }));

describe("Shops & cafés toilets", () => {
  const mod = FEATURES.find((f) => f.id === "placeToilets")!;
  it("is a registered feature behind its own flag with lazy layers and overlay", () => {
    expect(mod).toBeDefined();
    expect(FLAGS.placeToilets.tier).toBe("basic");
    expect(mod.chips).toEqual(["restroomShops"]);
    expect(typeof mod.layers).toBe("function");
    expect(typeof mod.overlay?.load).toBe("function");
  });
  it("is off by default and only shows from zoom 15", () => {
    expect(isShopsEnabled()).toBe(false);
    expect(MIN_ZOOM).toBe(15);
  });
  it("notifies the layer when the toggle changes", () => {
    const seen: boolean[] = [];
    const off = subscribeShops((on) => seen.push(on));
    setShopsEnabled(true);
    setShopsEnabled(true);
    setShopsEnabled(false);
    off();
    expect(seen).toEqual([true, false]);
  });
  it("labels access as Anyone / Customers only", () => {
    expect(ACCESS_LABEL).toEqual({ anyone: "Anyone", customers: "Customers only" });
  });
});
