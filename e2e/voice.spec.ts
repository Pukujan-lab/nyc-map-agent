import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";

/** A fake Web Speech recognizer that "hears" one phrase per start(); no microphone is used. */
async function fakeSpeech(page: Page, phrases: string[]) {
  await page.addInitScript((said: string[]) => {
    const queue = [...said];
    class FakeRecognition {
      lang = "en-US"; continuous = false; interimResults = true; maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null; onstart: (() => void) | null = null;
      start() {
        const text = queue.shift();
        setTimeout(() => {
          this.onstart?.();
          if (text) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
        }, 50);
        if (!this.continuous) setTimeout(() => this.onend?.(), 300);
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    // Newer Chromium ships an unprefixed SpeechRecognition too; replace both.
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  }, phrases);
}

test("Voice: labelled button next to Ask answers a next-train ask without the model", async ({ page }) => {
  await fakeSpeech(page, ["When is the next train at Bedford Av?"]);
  await mockNetwork(page);
  let agentCalls = 0;
  await page.route("**/api/agent", (r) => { agentCalls += 1; return r.fulfill({ status: 500 }); });
  await page.route("**/api/transit/subway", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ at: Date.now() / 1000, trips: [] }) }));
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByText("No trains are predicted at Bedford Av right now.")).toBeVisible();
  expect(agentCalls).toBe(0);
  await page.screenshot({ path: process.env.QA_SHOT ?? "test-results/voice.png" });
});

test("Voice: free-form ask says Ask isn't available when the model fails", async ({ page }) => {
  await fakeSpeech(page, ["write me a poem"]);
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: `${JSON.stringify({ type: "error", message: "The model call failed." })}\n` }));
  await page.goto("/");
  await page.getByRole("button", { name: "Voice", exact: true }).click();
  await expect(page.getByText("Ask isn't available right now.", { exact: false })).toBeVisible();
});

test("Voice: hands-free shows a clear Stop listening control", async ({ page }) => {
  await fakeSpeech(page, []);
  await mockNetwork(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("button", { name: "Assistant settings" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Hands-free/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Stop listening" }).first().click();
  await expect(page.getByText("Hands-free is on")).toHaveCount(0);
});
