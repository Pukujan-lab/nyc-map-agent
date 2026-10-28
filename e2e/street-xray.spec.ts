import { expect, test } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";

/**
 * Street view X-ray sees a short way ahead (150 m, in the cone you look along),
 * not the whole city's tunnels through every building.
 */
for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`street view X-ray toggles on and keeps the layout at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?flags=-agentHome");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
    await page.waitForTimeout(2500);
    const toggle = page.getByTestId("xray-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
    await expectLayout(page);
  });
}
