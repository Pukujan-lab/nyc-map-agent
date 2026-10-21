import { expect, test, type ConsoleMessage } from "@playwright/test";
import { mockNetwork } from "./mocks";

// Network refusals we cause on purpose (mocks.ts) are not app bugs.
const EXPECTED = [/ERR_BLOCKED_BY_CLIENT/, /Failed to load resource/];

test("map loads, search opens a panel, street level toggles, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !EXPECTED.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await mockNetwork(page);

  await page.goto("/");

  // Map loads: the MapLibre canvas is up and our neighbourhood data arrived.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.waitForResponse((r) => r.url().includes("/api/aggregate"));

  // Search a neighbourhood and open its panel.
  const search = page.getByPlaceholder("Search neighborhoods, addresses, stations");
  await search.fill("Greenpoint");
  await page.getByRole("option", { name: /Greenpoint/ }).first().click();
  await expect(page.getByText("Greenpoint").first()).toBeVisible();

  // Street level on from the Layers & filters drawer, then off from the walk bar.
  const openLayers = () => page.getByRole("button", { name: "Layers & filters", exact: true }).click();
  await openLayers();
  await page.getByRole("button", { name: "Street view", exact: true }).click();
  const leave = page.getByRole("button", { name: "Leave street level and return to the overhead map" });
  await expect(leave).toBeVisible();
  await leave.click();
  await openLayers();
  await expect(page.getByRole("button", { name: "Street view", exact: true })).toHaveAttribute("aria-pressed", "false");

  expect(errors, errors.join("\n")).toEqual([]);
});
