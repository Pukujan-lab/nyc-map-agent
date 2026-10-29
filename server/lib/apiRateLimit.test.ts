import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { apiRateLimit } from "./apiRateLimit";

function appWith(max: string, clock: { t: number }) {
  const app = new Hono();
  app.use("/api/*", apiRateLimit({ API_RATE_PER_MINUTE: max }, () => clock.t));
  app.get("/api/*", (c) => c.text("ok"));
  return app;
}
const from = (ip?: string) => (ip ? { headers: { "cf-connecting-ip": ip } } : {});

describe("apiRateLimit", () => {
  it("refuses an address past the per-minute limit and frees it after a minute", async () => {
    const clock = { t: 0 };
    const app = appWith("2", clock);
    expect((await app.request("/api/weather", from("1.2.3.4"))).status).toBe(200);
    expect((await app.request("/api/weather", from("1.2.3.4"))).status).toBe(200);
    const res = await app.request("/api/weather", from("1.2.3.4"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await app.request("/api/weather", from("5.6.7.8"))).status).toBe(200);
    clock.t = 60_000;
    expect((await app.request("/api/weather", from("1.2.3.4"))).status).toBe(200);
  });

  it("leaves tiles and callers without an address alone", async () => {
    const app = appWith("1", { t: 0 });
    for (let i = 0; i < 3; i++) expect((await app.request("/api/v1/city-tiles", from("1.2.3.4"))).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await app.request("/api/weather")).status).toBe(200);
  });

  it("turns off at 0", async () => {
    const app = appWith("0", { t: 0 });
    for (let i = 0; i < 3; i++) expect((await app.request("/api/weather", from("1.2.3.4"))).status).toBe(200);
  });
});
