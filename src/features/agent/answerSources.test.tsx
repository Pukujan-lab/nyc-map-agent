import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerSources, ageText } from "./AnswerSources";
import { streamEvent } from "./schema";

const NOW = Date.parse("2026-10-23T20:00:00Z");

describe("answer sources line (#375)", () => {
  it("says the data's age in plain words", () => {
    expect(ageText(new Date(NOW - 40_000).toISOString(), NOW)).toBe("updated 40 s ago");
    expect(ageText(new Date(NOW - 3 * 60_000).toISOString(), NOW)).toBe("updated 3 min ago");
    expect(ageText(new Date(NOW - 5 * 3600_000).toISOString(), NOW)).toBe("updated 5 h ago");
    expect(ageText("2025-06-27T13:37:17Z", NOW)).toBe("updated Jun 2025");
    expect(ageText(null, NOW)).toBe("update time unknown");
  });

  it("parses the stream line and renders sources, stale marks and unverified figures", () => {
    const ev = streamEvent.parse({
      type: "sources",
      sources: [
        { id: "mta-alerts", label: "MTA service alerts", asOf: new Date(NOW - 40_000).toISOString(), url: "https://new.mta.info/alerts", stale: false },
        { id: "restrooms", label: "NYC public restrooms", asOf: "2025-06-27T13:37:17Z", stale: true, note: "City list; hours and status can be out of date." },
      ],
    });
    if (ev.type !== "sources") throw new Error("not a sources line");
    expect(ev.unverified).toEqual([]);
    const html = renderToStaticMarkup(<AnswerSources line={ev} now={NOW} />);
    expect(html).toContain("Sources");
    expect(html).toContain("MTA service alerts</a>, updated 40 s ago");
    expect(html).toContain("NYC public restrooms, updated Jun 2025 (may be out of date)");
    expect(renderToStaticMarkup(<AnswerSources line={{ sources: [], unverified: ["312"] }} now={NOW} />)).toContain("No data source backs the figures in this answer (312)");
    expect(renderToStaticMarkup(<AnswerSources line={{ sources: [], unverified: [] }} now={NOW} />)).toBe("");
  });
});
