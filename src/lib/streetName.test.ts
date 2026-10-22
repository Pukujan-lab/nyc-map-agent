import { describe, expect, it } from "vitest";
import { formatStreetName, formatStreetPair } from "./streetName";

describe("formatStreetName", () => {
  it.each([
    ["Grand St", "Grand Street"],
    ["Essex St", "Essex Street"],
    ["W 44 St", "West 44 Street"],
    ["W 44th St", "West 44th Street"],
    ["E Broadway", "East Broadway"],
    ["8 Av", "8 Avenue"],
    ["Park Ave", "Park Avenue"],
    ["Av A", "Avenue A"],
    ["Ave of the Americas", "Avenue of the Americas"],
    ["St Marks Pl", "St. Marks Place"],
    ["St Nicholas Ave", "St. Nicholas Avenue"],
    ["Ocean Pkwy", "Ocean Parkway"],
    ["Brooklyn Queens Expy", "Brooklyn Queens Expressway"],
    ["Henry Hudson Pkwy", "Henry Hudson Parkway"],
    ["Union Sq E", "Union Square East"],
    ["Grand Concourse", "Grand Concourse"],
    ["Ocean Blvd", "Ocean Boulevard"],
    ["Maiden Ln", "Maiden Lane"],
    ["Riverside Dr", "Riverside Drive"],
    ["Cooper Sq", "Cooper Square"],
    ["Prospect Park Ter", "Prospect Park Terrace"],
    ["Cadman Plz W", "Cadman Plaza West"],
    ["Court Sq", "Court Square"],
    ["Washington Ct", "Washington Court"],
    ["Linden Blvd", "Linden Boulevard"],
    ["Broadway", "Broadway"],
    ["Avenue S", "Avenue S"],
    ["Av S", "Avenue S"],
    ["W 4 St", "West 4 Street"],
    ["N 7 St", "North 7 Street"],
    ["GRAND ST", "Grand Street"],
    ["ST MARKS PL", "St. Marks Place"],
    ["Pelham Pkwy S", "Pelham Parkway South"],
    ["", ""],
  ])("%s → %s", (input, want) => {
    expect(formatStreetName(input)).toBe(want);
  });
  it("leaves an already-spelled name alone", () => {
    expect(formatStreetName("West 44th Street")).toBe("West 44th Street");
  });
  it("formats both halves of a corner", () => {
    expect(formatStreetPair("Grand St & Essex St")).toBe("Grand Street & Essex Street");
    expect(formatStreetPair("W 44 St at 8 Av")).toBe("West 44 Street at 8 Avenue");
  });
});
