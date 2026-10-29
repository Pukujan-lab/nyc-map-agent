import { describe, expect, it } from "vitest";
import { answerWithoutModel, fastIntent, noModelIntent } from "./noModel";
import { makeTools } from "./tools";

describe("noModelIntent", () => {
  it("knows a restroom question in English and Spanish", () => {
    expect(noModelIntent("where is the nearest restroom?")).toEqual({ kind: "restroom" });
    expect(noModelIntent("¿Dónde hay un baño cerca?")).toEqual({ kind: "restroom" });
  });

  it("knows the Restroom button's question in every app language", async () => {
    const { tr } = await import("../../../src/lib/i18n/appLang");
    for (const lang of ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const) {
      expect(noModelIntent(tr(lang, "askRestroom")), lang).toEqual({ kind: "restroom" });
    }
  });

  it("reads a subway line by its capital letter or number", () => {
    expect(noModelIntent("is the N train running?")).toEqual({ kind: "line", route: "N" });
    expect(noModelIntent("any delays on the 7 line")).toEqual({ kind: "line", route: "7" });
    expect(noModelIntent("Is the Q delayed")).toEqual({ kind: "line", route: "Q" });
  });

  it("leaves everything else to the model", () => {
    expect(noModelIntent("take a train to Flushing")).toBeNull();
    expect(noModelIntent("how do I get to the Met?")).toBeNull();
  });
});

describe("answerWithoutModel", () => {
  const row = { facility_name: "Union Square Park", longitude: "-73.9905", latitude: "40.7362", status: "Operational", hours_of_operation: "8am-8pm", accessibility: "Fully Accessible" };
  const walk = () => Promise.resolve({ coords: [[-73.99, 40.735], [-73.9905, 40.7362]] as [number, number][], distanceM: 140, durationS: 120, turns: [] });
  const tools = (location: { lon: number; lat: number } | null) => makeTools({
    location, emit: () => {},
    deps: { restrooms: () => Promise.resolve([row]), walk, landmarks: () => Promise.resolve([]), alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]) },
  });

  it("names the nearest restroom and the walk", async () => {
    const text = await answerWithoutModel({ text: "nearest bathroom", hasLocation: true }, tools({ lon: -73.99, lat: 40.735 }));
    expect(text).toMatch(/Union Square Park, about 2 min on foot/);
    expect(text).toMatch(/Open today 8am-8pm\./);
  });

  it("asks for the location when it has none", async () => {
    expect(await answerWithoutModel({ text: "nearest bathroom", hasLocation: false }, tools(null))).toMatch(/Use my location/);
  });

  it("says a quiet line is quiet", async () => {
    expect(await answerWithoutModel({ text: "is the L train running", hasLocation: false }, tools(null))).toMatch(/no delays or changes on the L train/);
  });

  it("returns null for other questions", async () => {
    expect(await answerWithoutModel({ text: "what's the weather", hasLocation: false }, tools(null))).toBeNull();
  });
});

describe("fastIntent: answered before the model", () => {
  it("takes the home buttons' plain English questions", async () => {
    const { tr } = await import("../../../src/lib/i18n/appLang");
    expect(fastIntent(tr("en", "askRestroom"))).toEqual({ kind: "restroom" });
    expect(fastIntent(tr("en", "askLine").replace("{r}", "7"))).toEqual({ kind: "line", route: "7" });
  });

  it("takes short plain asks", () => {
    expect(fastIntent("nearest bathroom")).toEqual({ kind: "restroom" });
    expect(fastIntent("I need a toilet near me")).toEqual({ kind: "restroom" });
    expect(fastIntent("Where’s the closest restroom?")).toEqual({ kind: "restroom" });
    expect(fastIntent("is the A train running?")).toEqual({ kind: "line", route: "A" });
    expect(fastIntent("any delays on the Q")).toEqual({ kind: "line", route: "Q" });
    expect(fastIntent("L train status")).toEqual({ kind: "line", route: "L" });
  });

  it("leaves anything with more in it to the model", () => {
    expect(fastIntent("nearest public restroom to Bryant Park")).toBeNull();
    expect(fastIntent("I'm with a stroller and need a bathroom on the way to Penn")).toBeNull();
    expect(fastIntent("is the 7 running to Flushing?")).toBeNull();
    expect(fastIntent("is the N or the Q faster?")).toBeNull();
    expect(fastIntent("is there a delay")).toBeNull();
    expect(fastIntent("how do I get to the Met?")).toBeNull();
    // Other languages: the model answers in the asker's language.
    expect(fastIntent("¿Dónde hay un baño cerca?")).toBeNull();
  });
});
