import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store/MapStateContext", () => ({ useMapState: () => ({ seedChat: () => {}, setChatOpen: () => {} }) }));
vi.mock("./hooks", () => ({ useTransitData: () => ({}), useAlerts: () => ({ data: undefined }), useNow: () => 0 }));

const { LinePanel } = await import("./LinePanel");
const { sendScreen } = await import("@/lib/screen/screenSpace");
const render = () => renderToStaticMarkup(<LinePanel map={undefined} route="A" onFollow={() => {}} />);

describe("line panel and the answer (docs/PDD.md, Screen space)", () => {
  // Server rendering runs no effects, so the test reports the open line itself.
  beforeEach(() => sendScreen({ type: "LINE", on: true }));
  afterEach(() => { sendScreen({ type: "ANSWER", on: false }); sendScreen({ type: "LINE", on: false }); sendScreen({ type: "SIZE", size: "phone" }); });

  it("folds to its pill on a phone while an answer is open", () => {
    sendScreen({ type: "ANSWER", on: true });
    const html = render();
    expect(html).toMatch(/data-testid="line-body" class="pointer-events-auto hidden/);
    expect(html).toContain('aria-label="Show the A line"');
  });

  it("stays open on a phone with no answer", () => {
    expect(render()).toMatch(/data-testid="line-body" class="pointer-events-auto flex/);
  });

  it("stays open beside the answer from 640 px, docked to the side", () => {
    sendScreen({ type: "SIZE", size: "wide" });
    sendScreen({ type: "ANSWER", on: true });
    const html = render();
    expect(html).toMatch(/data-testid="line-body" class="pointer-events-auto flex/);
    expect(html).toContain("sm:left-auto");
  });
});
