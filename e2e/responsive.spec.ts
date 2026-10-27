import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";

/**
 * Every main screen meets the layout bar in e2e/layout.ts at every size in
 * SIZES: nothing off the side, no tap target under 24 px, nothing covering a
 * control, and the map's focus clear of every panel. A new screen adds a case here.
 */
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const RESTROOM = { name: "Bryant Park", lon: -73.9832, lat: 40.7536, distanceM: 420, hours: "8am-8pm" };


async function ask(page: Page, text: string) {
  await page.getByLabel("Ask the assistant").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** The app with the network mocked; `answer` is what the agent says (registered after the mocks, so it wins). */
async function open(page: Page, answer: unknown[] = []) {
  await mockNetwork(page);
  if (answer.length) await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([...answer, { type: "done" }]) }));
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
}

for (const size of SIZES) {
  test.describe(`layout at ${size.name} ${size.width}×${size.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("home", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("agent-bar")).toBeVisible();
      await expectLayout(page);
    });

    test("a text answer", async ({ page }) => {
      await open(page, [{ type: "text", text: "Bryant Park has the nearest public restroom, about 6 minutes on foot." }]);
      await ask(page, "Nearest restroom?");
      await expect(page.getByTestId("answer-card")).toBeVisible();
      await expectLayout(page);
    });

    test("a restroom answer keeps the restroom in view", async ({ page }) => {
      await open(page, [
        { type: "text", text: "Bryant Park is the closest open restroom." },
        { type: "actions", actions: [{ kind: "showRestroom", id: "restroom:bp", label: "Show the nearest restroom", restroom: RESTROOM }] },
      ]);
      await ask(page, "Where is the nearest restroom?");
      await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
      await expectLayout(page, { focus: [RESTROOM.lon, RESTROOM.lat] });
    });

    test("a trip card", async ({ page }) => {
      await open(page, [
        { type: "command", command: { type: "showRoute", trip } },
        { type: "command", command: { type: "openPanel", trip } },
        { type: "text", text: "Take this route." },
      ]);
      await ask(page, "Plan a trip from Union Square to Grand Central");
      await expect(page.getByRole("region", { name: "Trip preview" })).toBeVisible();
      await expectLayout(page);
    });

    test("a second quick question is held, then answered (no refusal)", async ({ page }) => {
      await open(page);
      let n = 0;
      await page.route("**/api/agent", (r) => {
        n += 1;
        return r.fulfill({ contentType: "application/x-ndjson", body: stream([{ type: "text", text: n === 1 ? "First answer." : "Times Square is 12 minutes away on the 1 train." }, { type: "done" }]) });
      });
      await ask(page, "Nearest restroom?");
      await expect(page.getByText("First answer.")).toBeVisible();
      await ask(page, "Plan my trip to Times Square, leaving now.");
      await expect(page.getByText(/Sending in a moment/).first()).toBeVisible();
      await expectLayout(page);
      await expect(page.getByText("Times Square is 12 minutes away on the 1 train.")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/between questions/)).toHaveCount(0);
      await expectLayout(page);
    });

    test("a line panel", async ({ page }) => {
      await open(page, [
        { type: "text", text: "The 7 is running with delays." },
        { type: "actions", actions: [{ kind: "showLine", id: "line:7", label: "See the 7 trains live", route: "7" }] },
      ]);
      await ask(page, "How is the 7?");
      await page.getByRole("button", { name: "See the 7 trains live" }).click();
      await page.waitForTimeout(800);
      await expectLayout(page);
    });
  });
}

test("Escape while typing a follow-up leaves the answer open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, [{ type: "text", text: "Bryant Park has the nearest public restroom." }]);
  await ask(page, "Nearest restroom?");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  const box = page.getByLabel("Ask the assistant");
  await box.fill("and is it op");
  await box.press("Escape");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  await box.fill("");
  await box.press("Escape");
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
});
