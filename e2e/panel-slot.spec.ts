import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";

/**
 * The primary panel slot (UI plan, build step 2): one panel at a time, a
 * feature tap closes the drawer, an empty tap leaves the drawer open, and Esc /
 * Back close the top panel before they stop Follow.
 */

const PHONE = { width: 390, height: 844 };
// The phone home view (MapView: HOME_VIEW centre, zoom 9.9 under 640px).
const HOME = { lon: -73.94, lat: 40.7, zoom: 9.9 };
const BUS_Y = 0.3; // fraction of the viewport height: above the drawer
/** Latitude drawn `dy` CSS px above the centre (MapLibre's 512px Web Mercator). */
function latAbove(dy: number) {
  const world = 512 * 2 ** HOME.zoom;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + (HOME.lat * Math.PI) / 360)) / Math.PI) / 2 * world - dy;
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI;
}
// One live bus parked in the strip of map the open drawer leaves free.
const BUS = { id: "MTA_1234", route: "B62", dir: 0, lon: HOME.lon, lat: latAbove(PHONE.height * (0.5 - BUS_Y)), bearing: 90, next: "Greenpoint Av", t: 0 };

async function open(page: Page, size = PHONE) {
  await page.setViewportSize(size);
  await mockNetwork(page);
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: true }) }));
  // Buses stay off until one page is named. This page is just the B62 the tap needs.
  await page.route(/\/api\/transit\/bus/, async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/bus-lines")) {
      await r.fulfill({ contentType: "application/json", body: JSON.stringify({ groups: [{ id: "brooklyn", label: "Brooklyn", pages: [{ id: "brooklyn-1", label: "B62", routes: ["B62"] }] }] }) });
      return;
    }
    if (!path.endsWith("/bus")) { await r.fallback(); return; }
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ at: Math.floor(Date.now() / 1000), buses: [{ ...BUS, t: Math.floor(Date.now() / 1000) }] }) });
  });
  await page.goto("/?transit=bus&busPage=brooklyn-1");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await page.waitForResponse((r) => r.url().includes("/api/aggregate"));
}

// By text: the vaul details sheet still marks the page behind it aria-hidden.
const layers = (page: Page) => page.locator("button", { hasText: /^Layers & filters$/ });
const drawer = (page: Page) => page.getByTestId("layers-drawer");
const sheet = (page: Page) => page.getByTestId("details-sheet");

async function openPlace(page: Page) {
  await page.getByPlaceholder("Search neighborhoods, addresses, stations").fill("Greenpoint");
  await page.getByRole("option", { name: /Greenpoint/ }).first().click();
  await expect(sheet(page)).toBeVisible();
}

/** Tap the map canvas at a point given as a fraction of its size. */
async function tapMap(page: Page, fx: number, fy: number) {
  const box = (await page.locator("canvas.maplibregl-canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("390px: drawer and sheet never overlap", async ({ page }) => {
  await open(page);
  await openPlace(page);
  await layers(page).click();
  await expect(drawer(page)).toBeVisible();
  // The drawer takes the slot; the sheet waits behind it rather than stacking.
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
});

test("a vehicle tap closes the drawer and follows it with a slim card", async ({ page }) => {
  await open(page);
  await layers(page).click();
  await expect(drawer(page)).toBeVisible();
  // Non-modal: the map behind the drawer still takes the tap. Retry until
  // the bus layer has drawn; a miss on the open drawer's map strip is NJ.
  await expect.poll(async () => {
    await tapMap(page, 0.5, BUS_Y);
    return page.getByTestId("follow-card").count();
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop following" }).first()).toBeVisible();
});

test("minimize turns the sheet into a labelled peek chip that restores", async ({ page }) => {
  await open(page);
  await openPlace(page);
  await page.getByRole("button", { name: "Minimize", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  const chip = page.getByTestId("peek-chip");
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(sheet(page)).toBeVisible();
});

test("an empty map tap leaves the layers drawer open", async ({ page }) => {
  await open(page);
  await layers(page).click();
  await expect(drawer(page)).toBeVisible();
  // Just under the top bar at the far left is New Jersey: no neighborhood, no vehicle.
  const bar = (await layers(page).boundingBox())!;
  const canvas = (await page.locator("canvas.maplibregl-canvas").first().boundingBox())!;
  await page.mouse.click(canvas.x + 8, bar.y + bar.height + 24);
  await expect(drawer(page)).toBeVisible();
});

test("an empty map tap closes a details sheet", async ({ page }) => {
  await open(page);
  await openPlace(page);
  await expect(sheet(page)).toBeVisible();
  const bar = (await layers(page).boundingBox())!;
  const canvas = (await page.locator("canvas.maplibregl-canvas").first().boundingBox())!;
  await page.mouse.click(canvas.x + 8, bar.y + bar.height + 24);
  await expect(sheet(page)).toHaveCount(0);
});

test("Esc and Back close the top panel first", async ({ page }) => {
  await open(page);
  await openPlace(page);
  await layers(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  // The app is still here: Back closed a panel, it did not leave the page.
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
});
