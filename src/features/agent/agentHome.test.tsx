import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerCard } from "./AgentHome";
import { TaskButtons } from "./HomeTasks";

const noop = () => {};

describe("chat-first home (#370)", () => {
  it("draws the four tasks with a restroom pictogram, never WC", () => {
    const html = renderToStaticMarkup(<TaskButtons on={{ restroom: noop, train: noop, plan: noop, exit: noop }} />);
    for (const label of ["Restroom", "My train", "Plan trip", "Find exit"]) expect(html).toContain(label);
    expect(html).not.toMatch(/\bWC\b/);
    expect(html.match(/<svg/g)).toHaveLength(4);
  });

  it("shows one primary action and keeps sources and follow-ups behind More", () => {
    const html = renderToStaticMarkup(
      <AnswerCard question="Nearest restroom?" text="Bryant Park, 6 min." busy={false} working={null} sources={<span>Sources</span>} primary={{ label: "Walk me there", run: noop }} followUps={[{ label: "What's nearby", run: noop }]} extra={null} />,
    );
    expect(html).toContain("Nearest restroom?");
    expect(html).toContain("Walk me there");
    expect(html).toMatch(/aria-expanded="false"[^>]*>More/);
    // A casual user sees only the answer and one action; the rest waits behind More.
    expect(html).not.toContain("What&#x27;s nearby");
    expect(html).not.toContain("<span>Sources</span>");
  });

  it("puts Use my location right under a reply that asks for it, with no More", () => {
    const html = renderToStaticMarkup(
      <AnswerCard question="Other ways?" text="Where are you starting from? Tap Use my location." busy={false} working={null} sources={<span>Sources</span>} primary={{ label: "Show it", run: noop }}
        location={<button type="button">Use my location</button>} followUps={[{ label: "What's nearby", run: noop }]} extra={<p>later</p>} />,
    );
    expect(html).toContain("Use my location");
    expect(html).not.toContain("Show it");
    expect(html).not.toMatch(/>More/);
    // The button comes before anything else under the reply.
    expect(html.indexOf("Use my location</button>")).toBeLessThan(html.indexOf("later"));
  });

  it("has no More when the answer has nothing behind it", () => {
    const html = renderToStaticMarkup(
      <AnswerCard question="Is the 2 running?" text="Yes, on time." busy={false} working={null} sources={null} primary={null} followUps={[]} extra={null} />,
    );
    expect(html).not.toMatch(/>More/);
  });

  it("holds the buttons back while the agent is still working", () => {
    const html = renderToStaticMarkup(
      <AnswerCard question="Nearest restroom?" text="Bryant" busy working={<div>working</div>} sources={null} primary={{ label: "Walk me there", run: noop }} followUps={[{ label: "What's nearby", run: noop }]} extra={null} />,
    );
    expect(html).toContain("working");
    expect(html).not.toContain("Walk me there");
    expect(html).not.toContain("Where this comes from");
  });
});
