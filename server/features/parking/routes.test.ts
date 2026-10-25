import { afterEach, describe, expect, it, vi } from "vitest";
import { garages } from "./routes";

afterEach(() => vi.restoreAllMocks());

describe("parking garages on a cold cache", () => {
  it("answers with the licensed garages without waiting for a slow Overpass", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("overpass")) return new Promise<Response>(() => {}); // never answers
      return Promise.resolve(new Response(JSON.stringify([
        { license_nbr: "1", business_name: "PARK RIGHT CORP", address_building: "1", address_street_name: "W 34 ST", latitude: "40.75", longitude: "-73.99" },
      ]), { status: 200, headers: { "content-type": "application/json" } }));
    });
    const t0 = Date.now();
    const out = await garages(50);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(out.map((g) => g.source)).toEqual(["dcwp"]);
  });
});
