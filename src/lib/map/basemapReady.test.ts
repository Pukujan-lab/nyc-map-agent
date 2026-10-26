import { afterEach, describe, expect, it } from "vitest";
import { basemapReady, markBasemapReady, resetBasemapReady } from "./basemapReady";

describe("basemap ready", () => {
  afterEach(() => resetBasemapReady());

  it("starts not ready and stays ready once marked", () => {
    expect(basemapReady()).toBe(false);
    markBasemapReady();
    markBasemapReady();
    expect(basemapReady()).toBe(true);
  });
});
