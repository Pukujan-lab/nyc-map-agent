import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

const ORDER = [
  ["myDay", "My day"],
  ["layers", "Layers"],
  ["filters", "Filters"],
  ["data", "Data"],
  ["cityData", "City data"],
  ["settings", "Settings"],
] as const;

test("menu row: tapping an item makes it the leftmost pill and opens only its dropdown", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  const row = page.getByTestId("menu-row");
  await expect(row).toBeVisible();

  const pill = page.getByTestId("menu-pill");
  await expect(pill).toHaveText("My day");
  await expect(page.getByTestId("menu-dropdown")).toHaveCount(0);

  for (const [id, label] of ORDER) {
    if (id !== "myDay") await page.getByTestId(`menu-${id}`).click();
    else await pill.click();
    await expect(pill).toHaveText(label);
    await expect(pill).toHaveAttribute("aria-expanded", "true");
    const pillBox = await pill.boundingBox();
    expect(pillBox).not.toBeNull();
    const icons = row.locator("button[data-menu]");
    const n = await icons.count();
    for (let i = 0; i < n; i++) {
      const box = await icons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(pillBox!.x).toBeLessThanOrEqual(box!.x + 1);
    }
    await expect(page.getByTestId("menu-dropdown")).toHaveCount(1);
    await expect(page.getByRole("region", { name: label })).toBeVisible();
  }

  await pill.click();
  await expect(pill).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("menu-dropdown")).toHaveCount(0);
  await pill.click();
  await expect(page.getByTestId("menu-dropdown")).toHaveCount(1);
});

test.describe("older build", () => {
  // The offline worker would serve the chunk itself, out of the route's reach.
  test.use({ serviceWorkers: "block" });
  test("My day from an older build does not blank the page", async ({ page }) => {
  await mockNetwork(page);
  // A tab opened before a deploy asks for chunks that are gone. Mark a reload as just done so the guard holds.
  await page.addInitScript(() => sessionStorage.setItem("nyc-map:reloaded-for-build", String(Date.now())));
  await page.route(/\/assets\/MyDay-[^/]*\.js$/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await page.getByRole("button", { name: "My day" }).click();
  await expect(page.getByText("My day could not open")).toBeVisible();
  await expect(page.getByTestId("agent-bar")).toBeVisible();
});
});
