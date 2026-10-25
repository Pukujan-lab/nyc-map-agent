import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const SHOTS = process.env.LANG_SHOTS;

for (const [width, height] of [[375, 667], [320, 568]]) {
  test(`a question in Chinese turns the app's own text Chinese at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "text", text: "最近的厕所在中央公园的 Heckscher 运动场。" }, { type: "done" },
    ]) }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Restroom" })).toBeVisible();
    await page.getByLabel("Ask the assistant").fill("我要上厕所");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const ask = page.getByLabel("问助手");
    await expect(ask).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/zh-answer-${width}.png` });
    await page.getByRole("button", { name: "关闭回答" }).click();
    const restroom = page.getByRole("button", { name: "厕所" });
    await expect(restroom).toBeVisible();
    const box = await restroom.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/zh-home-${width}.png` });
  });
}
