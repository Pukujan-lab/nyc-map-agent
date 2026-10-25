import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

let wide = false;
vi.mock("@/lib/useMediaQuery", () => ({ useMediaQuery: () => wide }));
vi.mock("@/lib/store/MapStateContext", () => ({ useMapState: () => ({ seedChat: () => {}, setChatOpen: () => {} }) }));
vi.mock("./hooks", () => ({ useTransitData: () => ({}), useAlerts: () => ({ data: undefined }), useNow: () => 0 }));

const { LinePanel } = await import("./LinePanel");
const { publishAnswerShown } = await import("@/lib/agent/answerShown");
const render = () => renderToStaticMarkup(<LinePanel map={undefined} route="A" onFollow={() => {}} />);

describe("line panel and the answer (docs/PDD.md, Screen space)", () => {
  afterEach(() => { publishAnswerShown(false); wide = false; });

  it("folds to its pill on a phone while an answer is open", () => {
    publishAnswerShown(true);
    const html = render();
    expect(html).toMatch(/data-testid="line-body" class="pointer-events-auto hidden/);
    expect(html).toContain('aria-label="Show the A line"');
  });

  it("stays open on a phone with no answer", () => {
    expect(render()).toMatch(/data-testid="line-body" class="pointer-events-auto flex/);
  });

  it("stays open beside the answer from 640 px, docked to the side", () => {
    wide = true;
    publishAnswerShown(true);
    const html = render();
    expect(html).toMatch(/data-testid="line-body" class="pointer-events-auto flex/);
    expect(html).toContain("sm:left-auto");
  });
});
