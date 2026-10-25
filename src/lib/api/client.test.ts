import createClient from "openapi-fetch";
import { describe, expect, it } from "vitest";
import type { paths } from "./schema";

// A client like `api`, with a base URL because Node has no page to resolve "/api/…" against.
function client() {
  const seen: string[] = [];
  const fetch = (req: Request) => {
    seen.push(req.url);
    return Promise.resolve(Response.json({ rules: [], meters: [], signCount: 0 }));
  };
  return { seen, c: createClient<paths>({ baseUrl: "https://example.test", fetch }) };
}

describe("typed API client (#205)", () => {
  it("writes typed query parameters into the URL the server reads", async () => {
    const { seen, c } = client();
    const { data } = await c.GET("/api/parking/rules", { params: { query: { lon: -73.98765, lat: 40.75 } } });
    expect(seen).toEqual(["https://example.test/api/parking/rules?lon=-73.98765&lat=40.75"]);
    expect(data).toEqual({ rules: [], meters: [], signCount: 0 });
  });

  it("fills path parameters", async () => {
    const { seen, c } = client();
    await c.GET("/api/v1/area/{block}", { params: { path: { block: "120:340" } } });
    // Encoded on the way out; the server decodes path parameters.
    expect(seen).toEqual(["https://example.test/api/v1/area/120%3A340"]);
  });
});
