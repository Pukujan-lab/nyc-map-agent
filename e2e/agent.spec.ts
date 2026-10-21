import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

// Mocked LLM: /api/agent is answered with a canned NDJSON stream (a real trip shape, offline).
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const nd = (evs: unknown[]) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";

test("smart mode: trip question draws the route, opens the trip card and plays the preview", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7359, longitude: -73.9903 });
  await mockNetwork(page);
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }>; location: unknown };
    expect(body.location).not.toBeNull();
    const preview = body.messages.at(-1)!.content.includes("preview");
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: nd(
        preview
          ? [{ type: "command", command: { type: "playFlythrough", trip, speed: 30 } }, { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } }]
          : [
              { type: "tool", name: "transit_plan" },
              { type: "command", command: { type: "showRoute", trip } },
              { type: "command", command: { type: "openPanel", trip } },
              { type: "text", text: "Take the 4 and use the NW exit on E 41 St." },
              { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } },
            ],
      ),
    });
  });

  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  // Location is shared only from a tap on My location; then the rail offers to stop.
  await page.getByRole("button", { name: "Layers & filters", exact: true }).click();
  await page.getByRole("button", { name: "My location" }).click();
  await expect(page.getByRole("button", { name: "Stop sharing location" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Ask the assistant").fill("How will my trip be tomorrow from here to Grand Central at 9am?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Take the 4 and use the NW exit on E 41 St.")).toBeVisible();
  await expect(page.getByText(/Use the NW exit on E 41 St at Grand Central-42 St/).first()).toBeVisible();

  await page.getByLabel("Ask the assistant").fill("preview it");
  await page.getByRole("button", { name: "Send" }).click();
  const bar = page.getByRole("region", { name: "Trip preview" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Pause preview" }).click();
  await bar.getByRole("button", { name: "Skip to next leg" }).click();
  await bar.getByRole("button", { name: "Close preview" }).click();
  await expect(bar).toBeHidden();
});
