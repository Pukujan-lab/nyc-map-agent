import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";

/**
 * Transit-first taps: with Advanced off no neighbourhood / complaints card
 * ever opens — not from an empty-map tap, not at street level.
 */
const DESKTOP = { width: 1440, height: 900 };

async function open(page: Page) {
  await page.setViewportSize(DESKTOP);
  await mockNetwork(page);
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await page.waitForResponse((r) => r.url().includes("/api/aggregate"));
}

async function tapMap(page: Page, fx: number, fy: number) {
  const box = (await page.locator("canvas.maplibregl-canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

const complaints = (page: Page) => page.getByText(/complaints/i);

test("empty map tap opens nothing and shows no complaints card", async ({ page }) => {
  await open(page);
  await page.mouse.move(DESKTOP.width * 0.7, DESKTOP.height * 0.6);
  await tapMap(page, 0.7, 0.6);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("details-sheet")).toHaveCount(0);
  await expect(complaints(page)).toHaveCount(0);
});

test("street view tap never opens the neighbourhood card", async ({ page }) => {
  await open(page);
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  await page.waitForTimeout(2500);
  await tapMap(page, 0.5, 0.75);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("details-sheet")).toHaveCount(0);
  await expect(complaints(page)).toHaveCount(0);
});
