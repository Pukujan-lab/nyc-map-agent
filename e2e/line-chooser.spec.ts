import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";

// Myrtle Av on the J, M and Z: three lines share the track and the station.
const SUBWAY = JSON.parse(readFileSync(new URL("../public/transit/subway.json", import.meta.url), "utf8")) as {
  stations: { features: Array<{ properties: { id: string }; geometry: { coordinates: [number, number] } }> };
};
const MYRTLE = SUBWAY.stations.features.find((f) => f.properties.id === "M11")!.geometry.coordinates;

type TestMap = { jumpTo(o: object): void; project(p: [number, number]): { x: number; y: number }; loaded(): boolean; areTilesLoaded(): boolean; getLayer(id: string): unknown; getContainer(): HTMLElement };

async function tapMyrtle(page: Page) {
  await mockNetwork(page);
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __map?: TestMap }).__map?.getLayer("transit-line")), null, { timeout: 20_000 });
  await page.evaluate((c) => (window as unknown as { __map: TestMap }).__map.jumpTo({ center: c, zoom: 13.5, bearing: 0, pitch: 0 }), MYRTLE);
  await page.waitForTimeout(800);
  const at = await page.evaluate((c) => {
    const m = (window as unknown as { __map: TestMap }).__map;
    const p = m.project(c);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, MYRTLE);
  await page.mouse.click(at.x, at.y);
  return at;
}

test("a tap where the J, M and Z meet asks which line, and a bullet opens that line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const at = await tapMyrtle(page);
  const chooser = page.getByTestId("line-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.locator("[data-line]")).toHaveText(["J", "M", "Z"]);
  await expect(chooser.getByRole("button", { name: "Myrtle Av station" })).toBeVisible();
  // It sits just above the tapped spot.
  const b = (await chooser.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(at.y);
  expect(Math.abs(b.x + b.width / 2 - at.x)).toBeLessThan(4);
  await chooser.getByRole("button", { name: "M line" }).click();
  await expect(chooser).toBeHidden();
  await expect(page.getByTestId("line-panel")).toContainText("M");
});

test("on a phone the chooser docks above the chat bar, and the station opens its card", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await tapMyrtle(page);
  const chooser = page.getByTestId("line-chooser");
  await expect(chooser).toBeVisible();
  const b = (await chooser.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(375);
  const chat = (await page.getByRole("textbox", { name: "Ask the assistant" }).boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(chat.y);
  await chooser.getByRole("button", { name: "Myrtle Av station" }).click();
  await expect(chooser).toBeHidden();
  await expect(page.getByText("Myrtle Av").first()).toBeVisible();
});
