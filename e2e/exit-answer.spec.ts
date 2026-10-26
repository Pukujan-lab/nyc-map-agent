import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const SHOTS = process.env.EXIT_SHOTS;
const exit: [number, number] = [-73.98798, 40.74967];
const dest: [number, number] = [-73.98566, 40.74844];

for (const [width, height] of [[375, 667], [320, 568]]) {
  test(`a which-exit answer is the map, with a small card, at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "text", text: "Take the NE exit on West 34 Street. About 3 minutes on foot." },
      { type: "actions", actions: [{
        kind: "showExit", id: "exit:test", label: "Show the NE exit on West 34 Street exit", station: "34 St-Herald Sq",
        exit: { at: exit, label: "NE exit on West 34 Street", elevatorOnly: false },
        destination: { at: dest, label: "Empire State Building" },
        path: [exit, [-73.987, 40.7492], dest], walkMin: 3,
      }] },
      { type: "done" },
    ]) }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Restroom" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Ask the assistant").fill("Which exit for the Empire State Building?");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    // The answer stays small so the exit and its walk show on the map above it.
    const card = page.locator('[data-testid="answer-card"][data-compact]');
    await expect(card).toContainText("NE exit on West 34 Street");
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThan(height * 0.45);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // Let the camera finish framing the exit before the picture.
    if (SHOTS) { await page.waitForTimeout(1500); await page.screenshot({ path: `${SHOTS}/exit-${width}.png` }); }

    // More opens the full answer.
    await card.getByRole("button", { name: "More" }).click();
    await expect(page.locator('[data-testid="answer-card"]:not([data-compact])')).toBeVisible();
  });
}
