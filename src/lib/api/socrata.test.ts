import { describe, expect, it } from "vitest";
import { buildSocrataUrl, parseCsv } from "./socrata";

describe("parseCsv", () => {
  it("splits a simple table", () => {
    const table = parseCsv("a,b\n1,2\n3,4");
    expect(table.header).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted commas, escaped quotes, and CRLF", () => {
    const table = parseCsv(
      'name,descriptor\r\n"LOUD MUSIC","Loud Music/Party"\r\n"A, B","He said ""hi"""\r\n',
    );
    expect(table.header).toEqual(["name", "descriptor"]);
    expect(table.rows).toEqual([
      ["LOUD MUSIC", "Loud Music/Party"],
      ["A, B", 'He said "hi"'],
    ]);
  });

  it("keeps empty trailing fields", () => {
    const table = parseCsv("a,b,c\n1,,3");
    expect(table.rows).toEqual([["1", "", "3"]]);
  });
});

describe("buildSocrataUrl", () => {
  it("percent-encodes SoQL values without string concatenation", () => {
    const url = buildSocrataUrl("erm2-nwe9", "csv", {
      $where: "complaint_type like 'Noise%'",
      $limit: "10",
    });
    expect(url.startsWith("https://data.cityofnewyork.us/resource/erm2-nwe9.csv?")).toBe(
      true,
    );
    expect(url).toContain("%25");
    expect(url).toContain("%24limit=10");
  });
});
