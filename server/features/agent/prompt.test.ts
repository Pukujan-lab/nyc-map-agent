import { describe, expect, it } from "vitest";
import { SOURCES } from "../../../src/lib/datasets/registry";
import { SOURCE_INFO } from "./freshness";
import { NON_DATA_TOOLS } from "./audit";
import { systemPrompt } from "./prompt";
import { makeTools } from "./tools";

const prompt = systemPrompt("2026-10-23T09:00", null);
const tools = Object.keys(makeTools({ location: null, emit: () => {} }));

describe("system prompt: no guessing (#375)", () => {
  it("tells the model to say it does not know instead of estimating", () => {
    expect(prompt).toMatch(/Never guess/);
    expect(prompt).toMatch(/must come from a tool result/);
    expect(prompt).toMatch(/say you do not know/);
    expect(prompt).toMatch(/source is unavailable/);
    expect(prompt).toMatch(/stale, say the data may be out of date/);
  });

  it("states the known limits of 311 and crash data", () => {
    expect(prompt).toMatch(/311 counts are reports people made, not measured noise/);
    expect(prompt).toMatch(/runs weeks to months behind/);
  });
});

describe("system prompt: smarter instructions", () => {
  it("ranks the primary uses in the owner's order", () => {
    const order = ["trips", "restroom", "landmarks", "underground", "MTA trouble", "weather and traffic", "Secondary", "Third: businesses and food"];
    const at = order.map((w) => prompt.indexOf(w));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("asks one short follow-up when something is missing, shows rather than tells, and answers in the user's language", () => {
    expect(prompt).toMatch(/ask one short question and stop/);
    expect(prompt).toMatch(/Show rather than tell/);
    expect(prompt).toMatch(/language the user writes or speaks in/);
    expect(prompt).toMatch(/spoken aloud: 1-3 short sentences/);
  });

  it("lists every live feed and every map layer from the registries, with their caveats", () => {
    for (const s of Object.values(SOURCE_INFO)) expect(prompt).toContain(s.label);
    for (const s of SOURCES) expect(prompt).toContain(`${s.label} (${s.guide.cadence.toLowerCase()}`);
  });

  it("names only tools that exist, and names every data tool", () => {
    const named = new Set(prompt.match(/\b[a-z]+(?:_[a-z]+)+\b/g));
    for (const n of named) expect(tools, n).toContain(n);
    for (const t of tools.filter((t) => !NON_DATA_TOOLS.has(t))) expect(prompt, t).toContain(t);
  });
});
