import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

test("street level shows a mini map whose heading cone turns with the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockNetwork(page);
  // Neighbourhood outlines arrive early; the crime and noise summaries load only with an analytics layer on.
  const areas = page.waitForResponse((r) => r.url().includes("/api/areas"));
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await areas;
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  const mini = page.getByTestId("street-minimap");
  await expect(mini).toBeVisible({ timeout: 15_000 });
  const cone = page.getByTestId("minimap-cone");
  await page.waitForTimeout(1500);
  const before = Number(await cone.getAttribute("data-bearing"));
  await page.keyboard.down("d");
  await page.waitForTimeout(1200);
  await page.keyboard.up("d");
  await expect.poll(async () => Number(await cone.getAttribute("data-bearing"))).not.toBe(before);
  // Tapping the corner handle steps to the next size.
  const size = Number(await mini.getAttribute("data-size"));
  await page.getByRole("button", { name: "Resize map" }).click();
  await expect.poll(async () => Number(await mini.getAttribute("data-size"))).toBeGreaterThan(size);
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(mini).toHaveCount(0);
});

test("street level mini map points to the nearest restroom and the card offers directions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockNetwork(page);
  // One restroom about 700 m away: the chip must show even when it is past the inset's edge.
  await page.route("**/api/restrooms", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-73.9335, 40.7038] }, properties: { name: "Bryant Park", status: "Operational" } }],
      }),
    }),
  );
  // Neighbourhood outlines arrive early; the crime and noise summaries load only with an analytics layer on.
  const areas = page.waitForResponse((r) => r.url().includes("/api/areas"));
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await areas;
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  const chip = page.getByTestId("minimap-nearest-restroom");
  await expect(chip).toBeVisible({ timeout: 20_000 });
  await expect(chip).toHaveAttribute("aria-label", /^Nearest restroom, \d+ m /);
  await expect(chip).toContainText(" m");
  await chip.click();
  await expect(page.getByText("Bryant Park").first()).toBeVisible();
  // About 700 m from where street view starts: past the inset's edge, and close enough that Directions
  // from here draws the walk (a farther place asks the trip planner; see directionsFromHere.test.ts).
  await page.getByRole("button", { name: "Directions from here" }).click();
  await expect(page.getByText("Walking directions")).toBeVisible();
});
