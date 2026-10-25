import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";

/**
 * The focus rule (docs/PDD.md, "Screen space") at six screen sizes: with an
 * answer open, and with a menu open over it, the map keeps a clear strip of at
 * least 160 px, a menu folds the answer to its question chip, Escape steps
 * back exactly one level, and sending a question closes any open menu.
 */
const SIZES = [[320, 568], [375, 667], [390, 844], [820, 1180], [1280, 800], [1440, 900]] as const;
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

async function ask(page: Page, text: string) {
  await page.getByLabel("Ask the assistant").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** The largest clear gap left on the map, across and down, once the open covers are taken out. */
async function clearStrip(page: Page): Promise<{ across: number; down: number }> {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const map = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
    const covers = [...document.querySelectorAll<HTMLElement>("[data-map-cover], .task-top, .task-bottom, [data-testid=agent-bar]")]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const gap = (lo: number, hi: number, spans: Array<[number, number]>) => {
      let best = 0, at = lo;
      for (const [a, b] of spans.sort((x, y) => x[0] - y[0])) { best = Math.max(best, a - at); at = Math.max(at, b); }
      return Math.max(best, hi - at);
    };
    return {
      down: gap(map.top, map.bottom, covers.filter((r) => r.width > map.width * 0.6).map((r) => [r.top, r.bottom])),
      across: gap(map.left, map.right, covers.filter((r) => r.width <= map.width * 0.6).map((r) => [r.left, r.right])),
    };
  });
}

for (const [width, height] of SIZES) {
  test(`focus stays on screen at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "text", text: "Bryant Park has the nearest public restroom, about 6 minutes on foot." }, { type: "done" },
    ]) }));
    await page.goto("/");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();

    // Level 1: the answer is open.
    await ask(page, "Nearest restroom?");
    await expect(page.getByTestId("answer-card")).toBeVisible();
    let strip = await clearStrip(page);
    expect(Math.max(strip.down, strip.across)).toBeGreaterThanOrEqual(160);

    // A menu over the answer: the answer folds to its question chip, the map stays clear.
    await page.getByTestId("menu-pill").click();
    await expect(page.getByTestId("menu-dropdown")).toHaveCount(1);
    await expect(page.getByTestId("answer-chip")).toBeVisible();
    await expect(page.getByTestId("answer-card")).toHaveCount(0);
    strip = await clearStrip(page);
    expect(Math.max(strip.down, strip.across)).toBeGreaterThanOrEqual(160);

    // Escape steps back one level: the menu closes and the answer returns.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("menu-dropdown")).toHaveCount(0);
    await expect(page.getByTestId("answer-card")).toBeVisible();

    // Sending a question closes an open menu.
    await page.getByTestId("menu-pill").click();
    await expect(page.getByTestId("menu-dropdown")).toHaveCount(1);
    await page.getByLabel("Ask the assistant").fill("And the next one?");
    await page.getByLabel("Ask the assistant").press("Enter");
    await expect(page.getByTestId("menu-dropdown")).toHaveCount(0);
    await expect(page.getByTestId("answer-card")).toBeVisible();
  });
}
