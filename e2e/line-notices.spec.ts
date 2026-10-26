import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

// The 2 line with one elevator outage at Times Sq-42 St (captured from /api/transit-live, trimmed).
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/transit-live-2-line.json", import.meta.url), "utf8")) as {
  at: number; systems: { subway: { at: number; trips: Array<{ stops: Array<[string, number]>; vt: number }> } }; alerts: { at: number };
};

/** The fixture's times moved to now, so the trains are live and the feed is fresh. */
function liveNow(): string {
  const now = Math.floor(Date.now() / 1000);
  const shift = now - Math.min(...FIXTURE.systems.subway.trips.map((t) => t.vt));
  const d = structuredClone(FIXTURE);
  d.at = d.systems.subway.at = d.alerts.at = now;
  for (const t of d.systems.subway.trips) { t.vt += shift; t.stops = t.stops.map(([s, at]) => [s, at + shift]); }
  return JSON.stringify(d);
}

for (const [width, height] of [[375, 667], [320, 568]]) {
  test(`tapping an elevator notice takes the map to its station, above the line sheet, at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: liveNow() }));
    await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
    await page.goto("/");
    await page.getByRole("button", { name: "My train" }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: 15_000 });
    const sheet = page.getByTestId("line-panel");
    await expect(sheet).toBeVisible();

    // Fully up, the sheet covers most of a small phone: the station must still come into view above it.
    await page.getByTestId("sheet-grip").click();
    await expect(sheet).toHaveAttribute("data-level", "2");
    const notice = page.locator("[data-notice]", { hasText: "Elevator out at Times Sq-42 St" });
    await notice.scrollIntoViewIfNeeded();
    const zoom = () => page.evaluate(() => (window as unknown as { __map: { getZoom(): number } }).__map.getZoom());
    // The whole line is in view: far out, so a station is a dot among many.
    expect(await zoom()).toBeLessThan(13);
    await notice.click();

    const ring = page.locator(".maplibregl-marker", { hasText: "No elevator" });
    await expect(ring).toBeVisible();
    // Tapping the notice is asking where it is: the map goes in close on the station.
    await expect.poll(zoom, { timeout: 5_000 }).toBeGreaterThan(14);
    // Then the ring sits in the open map: on screen and above the sheet.
    await expect.poll(async () => {
      const r = (await ring.boundingBox())!;
      const s = (await sheet.boundingBox())!;
      return r.y >= 0 && r.x >= 0 && r.x + 34 <= width && r.y + 34 <= s.y;
    }, { timeout: 5_000 }).toBe(true);
  });
}
