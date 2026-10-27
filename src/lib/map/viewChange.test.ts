import { afterEach, describe, expect, it } from "vitest";
import { backToStreet, resetViewChangeForTests, setStreetSpot, showView, viewRequest } from "./viewChange";

afterEach(() => resetViewChangeForTests());

describe("showView", () => {
  it("asks for a view at a place and heading, each request new", () => {
    showView("3d", { lon: -73.99, lat: 40.73 }, 45);
    const first = viewRequest();
    expect(first).toMatchObject({ view: "3d", place: { lon: -73.99, lat: 40.73 }, heading: 45, exact: false });
    showView("3d", { lon: -73.99, lat: 40.73 }, 45);
    expect(viewRequest()?.nonce).not.toBe(first?.nonce);
  });

  it("goes back to the exact spot and heading you left street view from", () => {
    backToStreet();
    expect(viewRequest()).toBeNull();
    setStreetSpot({ lon: -73.98, lat: 40.75, heading: 120 });
    backToStreet();
    expect(viewRequest()).toMatchObject({ view: "street", place: { lon: -73.98, lat: 40.75 }, heading: 120, exact: true });
  });
});
