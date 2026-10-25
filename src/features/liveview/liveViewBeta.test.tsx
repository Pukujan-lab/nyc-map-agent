import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LiveViewBeta from "./LiveViewBeta";

const props = { accuracyM: 8, targetBearing: 0, instruction: "Turn left", distanceLabel: "60 m" };

describe("Live View (Beta) trigger (#192)", () => {
  it("is an icon button with a name on the home walking card", () => {
    const html = renderToStaticMarkup(<LiveViewBeta {...props} compact />);
    expect(html).toContain('aria-label="Live View (Beta)"');
    expect(html).toContain("task-action");
    expect(html).not.toContain("Live View (Beta)</");
  });

  it("is a labelled button everywhere else", () => {
    const html = renderToStaticMarkup(<LiveViewBeta {...props} />);
    expect(html).toContain("Live View (Beta)");
    expect(html).not.toContain("task-action");
  });

  it("asks for nothing until it is tapped", () => {
    const html = renderToStaticMarkup(<LiveViewBeta {...props} compact />);
    expect(html).not.toContain("<video");
    expect(html).not.toContain('role="dialog"');
  });
});
