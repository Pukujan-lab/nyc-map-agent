import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StreetLevelRow } from "./StreetLevels";

const rows: StreetLevelRow[] = [
  { borough: "BROOKLYN", noise_12mo: 927, crashes_12mo: 25, injury_crashes_12mo: 9, noise_level: "red", crash_level: "orange" },
  { borough: "MANHATTAN", noise_12mo: 99, crashes_12mo: 18, injury_crashes_12mo: 7, noise_level: "red", crash_level: "red" },
];
let data: StreetLevelRow[] | undefined = rows;
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data }) }));

const { StreetLevels, pickStreetRow } = await import("./StreetLevels");

describe("walk card noise and crash dots (#7)", () => {
  it("uses the walker's borough, or the busiest borough when it is unknown", () => {
    expect(pickStreetRow(rows, "MANHATTAN")?.crashes_12mo).toBe(18);
    expect(pickStreetRow(rows, null)?.borough).toBe("BROOKLYN");
    expect(pickStreetRow(rows, "QUEENS")).toBeNull();
  });

  it("shows a dot per level with a spoken name, folded until tapped", () => {
    const html = renderToStaticMarkup(<StreetLevels street="W 44 St" borough="MANHATTAN" />);
    expect(html).toContain("Noise very high");
    expect(html).toContain("Crashes very high");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Past year");
  });

  it("says nothing for a street with no records", () => {
    data = [];
    expect(renderToStaticMarkup(<StreetLevels street="Nowhere Ln" borough="QUEENS" />)).toBe("");
    data = rows;
  });
});
