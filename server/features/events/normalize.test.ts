import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CsclRows, Intersections, csclVariants, locateBlock, parkName, streetKey } from "./centerline";
import { decodeEntities, fromParks, fromPermitted, nyLocalToIso, parseBetween, parseParksCoordinates, permittedKind } from "./normalize";
import { Event, ParksEventRow, PermittedEventRow } from "./schema";

/** Real payloads saved from NYC Open Data on 2026-10-21 (descriptions trimmed). */
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const permitted = z.array(PermittedEventRow).parse(fixture("permitted-events.tvpp-9vvx.json"));
const parks = z.array(ParksEventRow).parse(fixture("parks-events.w3wp-dpdi.json"));
const centerline = CsclRows.parse(fixture("centerline.inkn-q76z.json"));

describe("zod parses real NYC Open Data payloads", () => {
  it("permitted events (tvpp-9vvx)", () => {
    expect(permitted.length).toBeGreaterThan(50);
    expect(new Set(permitted.map((r) => r.event_type))).toContain("Farmers Market");
  });
  it("Parks events (w3wp-dpdi)", () => {
    expect(parks.length).toBeGreaterThan(20);
    expect(parks.every((r) => r.guid && r.title)).toBe(true);
  });
  it("CSCL centerline (inkn-q76z)", () => {
    expect(centerline.length).toBeGreaterThan(5);
  });
  it("rejects a renamed column", () => {
    const broken: Record<string, unknown> = { ...permitted[0] };
    delete broken.event_location;
    expect(PermittedEventRow.safeParse(broken).success).toBe(false);
  });
});

describe("normalising", () => {
  it("converts New York wall time with the right offset across DST", () => {
    expect(nyLocalToIso("2026-10-22T15:00:00.000")).toBe("2026-10-22T15:00:00-04:00");
    expect(nyLocalToIso("2026-11-27T18:00:00.000")).toBe("2026-11-27T18:00:00-05:00");
  });
  it("parses street blocks, including multi-block permits", () => {
    expect(parseBetween("WEST BROADWAY between GRAND STREET and CANAL STREET")).toEqual({ on: "WEST BROADWAY", from: "GRAND STREET", to: "CANAL STREET" });
    expect(parseBetween("89 SOUTH STREET, SOUTH STREET between BEEKMAN STREET and WALL STREET")?.on).toBe("SOUTH STREET");
    expect(parseBetween("Union Square Park: North Plaza")).toBeNull();
  });
  it("maps permit types to kinds and drops non-public permits", () => {
    const k = (event_type: string, event_name = "x", event_agency = "Street Activity Permit Office") => permittedKind({ event_type, event_name, event_agency });
    expect(k("Farmers Market")).toBe("market");
    expect(k("Sidewalk Sale")).toBe("popup");
    expect(k("Street Festival")).toBe("fair");
    expect(k("Parade", "x", "Police Department")).toBe("closure");
    expect(k("Sport - Youth")).toBeNull();
    expect(k("Production Event")).toBeNull();
    expect(k("Special Event", "Oval Lawn Closure", "Parks Department")).toBeNull();
    expect(k("Special Event", "Union Square Greenmarket", "Parks Department")).toBe("market");
  });
  it("reads Parks coordinates as [lon, lat] and entities", () => {
    expect(parseParksCoordinates("40.88903808593750000, -73.89234161376953000")).toEqual([-73.892342, 40.889038]);
    expect(parseParksCoordinates("40.77, -73.76; 40.78, -73.77")).toEqual([-73.76, 40.77]);
    expect(parseParksCoordinates("")).toBeNull();
    expect(decodeEntities("NYC Parks&#8217; Open Call &amp; More")).toBe("NYC Parks\u2019 Open Call & More");
  });
  it("every Parks fixture row normalises to a valid Event or is skipped", () => {
    const out = parks.map(fromParks).filter((e) => e !== null);
    expect(out.length).toBeGreaterThan(5);
    for (const e of out) expect(Event.parse(e).url).toMatch(/^https:\/\/www\.nycgovparks\.org\//);
  });
});

describe("centerline geocoding", () => {
  const idx = new Intersections();
  idx.add(centerline);
  const index = new Map([["3", idx]]);
  it("finds a block as a line between its two cross streets", () => {
    const row = permitted.find((r) => r.event_id === "979421")!;
    const geom = locateBlock(row, index);
    expect(geom?.type).toBe("LineString");
    const e = fromPermitted(row, (r) => locateBlock(r, index));
    expect(e && Event.parse(e)).toMatchObject({ id: "permitted:979421", kind: "other", address: "Carroll Street between Rogers Avenue and Nostrand Avenue, Brooklyn" });
  });
  it("skips what it cannot place", () => {
    const row = { ...permitted.find((r) => r.event_id === "979421")!, event_borough: "Queens" };
    expect(locateBlock(row, index)).toBeNull();
    expect(fromPermitted(row, (r) => locateBlock(r, index))).toBeNull();
  });
  it("matches CSCL spellings", () => {
    expect(streetKey("WEST  117 STREET")).toBe(streetKey("W  117 ST"));
    expect(streetKey("WEST BROADWAY")).toBe("W BROADWAY");
    expect(csclVariants("EAST   42 STREET")).toContain("E   42 ST");
    expect(parkName("Union Square Park: North Plaza ,Union Square Park: South")).toBe("Union Square Park");
  });
});
