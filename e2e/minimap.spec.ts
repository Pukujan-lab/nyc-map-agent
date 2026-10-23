import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

test("street level shows a mini map whose heading cone turns with the camera", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await page.waitForResponse((r) => r.url().includes("/api/aggregate"));
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
  await page.getByRole("button", { name: "Hide map" }).click();
  await expect(mini).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show map" })).toBeVisible();
});
