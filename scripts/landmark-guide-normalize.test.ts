import { describe, expect, it } from "vitest";
import { classify, commonsFile, normalize, parsePoint, pictureFromMeta, resolveBoroughs, stripHtml, type WdRow } from "./landmark-guide-normalize";

const row = (id: string, label: string, lon: number, lat: number, sitelinks: number, classes: string[]): WdRow => ({
  item: `http://www.wikidata.org/entity/${id}`,
  label,
  coord: `Point(${lon} ${lat})`,
  sitelinks,
  classes,
});

describe("classify", () => {
  it("keeps kinds you can see from the street", () => {
    expect(classify(["office building", "skyscraper"])).toBe("tower");
    expect(classify(["suspension bridge", "road bridge"])).toBe("bridge");
    expect(classify(["square", "neighborhood"])).toBe("square");
    expect(classify(["urban park"])).toBe("park");
    expect(classify(["union station", "underground railway station"])).toBe("station");
  });

  it("drops areas, streets, organisations, events and lost buildings", () => {
    expect(classify(["neighborhood of Manhattan"])).toBeNull();
    expect(classify(["shopping street", "avenue"])).toBeNull();
    expect(classify(["research university"])).toBeNull();
    expect(classify(["destroyed building or structure", "baseball venue"])).toBeNull();
    expect(classify(["library network", "public library"])).toBeNull();
  });
});

describe("parsing", () => {
  it("reads WKT points and rounds to 5 decimals", () => {
    expect(parsePoint("Point(-73.985664 40.748433)")).toEqual([-73.98566, 40.74843]);
    expect(parsePoint("nonsense")).toBeNull();
  });

  it("turns a P18 URL into a Commons file name", () => {
    expect(commonsFile("http://commons.wikimedia.org/wiki/Special:FilePath/Empire%20State%20Building_(aerial).jpg")).toBe("Empire State Building (aerial).jpg");
  });

  it("stores a picture only with a free licence, author stripped of HTML", () => {
    const pic = pictureFromMeta("A b.jpg", {
      LicenseShortName: { value: "CC BY-SA 4.0" },
      Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Jane &amp; Co</a>' },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
    });
    expect(pic).toEqual({
      file: "A b.jpg",
      url: "https://commons.wikimedia.org/wiki/Special:FilePath/A_b.jpg?width=320",
      page: "https://commons.wikimedia.org/wiki/File:A_b.jpg",
      license: "CC BY-SA 4.0",
      artist: "Jane & Co",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    });
    expect(pictureFromMeta("x.jpg", { LicenseShortName: { value: "Fair use" } })).toBeNull();
    expect(pictureFromMeta("x.jpg", {})).toBeNull();
    expect(stripHtml("<b>Public</b>  domain")).toBe("Public domain");
  });
});

describe("normalize", () => {
  const rows = [
    row("Q1", "Big Tower", -73.98, 40.75, 120, ["skyscraper"]),
    row("Q2", "Small Tower Next Door", -73.9801, 40.7501, 40, ["skyscraper"]), // 14 m away, same kind
    row("Q3", "Station Under It", -73.9805, 40.7503, 35, ["union station"]), // ~60 m, other kind: kept
    row("Q4", "Big Tower", -73.95, 40.78, 30, ["skyscraper"]), // duplicate name
    row("Q5", "Some Subway Stop", -73.9, 40.85, 10, ["metro station"]),
    row("Q6", "Jersey Tower", -74.03, 40.72, 90, ["skyscraper"]), // no borough
    row("Q7", "A Neighbourhood", -73.94, 40.8, 80, ["neighborhood"]),
    row("Q8", "Island Statue", -74.044, 40.689, 150, ["statue"]), // NYC, no borough
    row("Q9", "Bronx Park", -73.88, 40.86, 12, ["urban park"]),
    row("Q10", "Bronx Museum", -73.92, 40.83, 8, ["museum"]),
    row("Q11", "Faint Manhattan Museum", -73.96, 40.77, 12, ["museum"]),
  ];
  const hints = new Map([
    ["Q1", { borough: "Manhattan" as const, inNyc: true }],
    ["Q2", { borough: "Manhattan" as const, inNyc: true }],
    ["Q3", { borough: "Manhattan" as const, inNyc: true }],
    ["Q4", { borough: "Manhattan" as const, inNyc: true }],
    ["Q5", { borough: "Bronx" as const, inNyc: true }],
    ["Q7", { borough: "Manhattan" as const, inNyc: true }],
    ["Q8", { inNyc: true }],
    ["Q9", { borough: "Bronx" as const, inNyc: true }],
    ["Q10", { borough: "Bronx" as const, inNyc: true }],
    ["Q11", { borough: "Manhattan" as const, inNyc: true }],
  ]);

  it("keeps an INCLUDE item below every floor, with its hand-set borough, name and tier", () => {
    const hellGate = row("Q1035131", "Hell Gate Bridge", -73.92194, 40.7825, 3, ["arch bridge"]);
    const terminal = row("Q5927015", "Saint George Terminal", -74.0742, 40.6433, 2, ["metro station"]);
    const out = normalize([hellGate, terminal], new Map());
    expect(out.find((l) => l.id === "Q1035131")).toMatchObject({ borough: "Queens", category: "bridge", tier: 2 });
    expect(out.find((l) => l.id === "Q5927015")).toMatchObject({ name: "St. George Ferry Terminal", borough: "Staten Island", category: "station" });
  });

  it("gives a city-only item the nearest borough and leaves New Jersey out", () => {
    const b = resolveBoroughs(rows, hints);
    expect(b.get("Q8")).toBe("Manhattan");
    expect(b.has("Q6")).toBe(false);
  });

  it("keeps known, street-visible, uncrowded places, strongest first, with tiers", () => {
    const out = normalize(rows, resolveBoroughs(rows, hints));
    expect(out.map((l) => l.id)).toEqual(["Q8", "Q1", "Q3", "Q9", "Q10"]);
    expect(out.find((l) => l.id === "Q8")).toMatchObject({ category: "monument", borough: "Manhattan", tier: 1, lon: -74.044, lat: 40.689 });
    expect(out.find((l) => l.id === "Q3")?.tier).toBe(2);
    // The Bronx's two strongest show citywide, so the overview is not Manhattan only.
    expect(out.filter((l) => l.borough === "Bronx").map((l) => l.tier)).toEqual([1, 1]);
  });
});
