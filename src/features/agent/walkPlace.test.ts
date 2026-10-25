import { describe, expect, it } from "vitest";
import { walkLine, walkPlace } from "./walkPlace";

const at: [number, number] = [-73.86, 40.73];
const off = (m: number): [number, number] => [at[0], at[1] + m / 111_320];

describe("walkPlace", () => {
  it("names the street and the two nearest storefronts", () => {
    const w = walkPlace({
      streets: ["Queens Blvd", "63 Drive"], corner: "NE",
      landmarks: [
        { name: "Chase", at: off(40), tall: false },
        { name: "Aldi", at: off(10), tall: false },
        { name: "Aldi", at: off(12), tall: false },
        { name: "Duane Reade", at: off(55), tall: false },
        { name: "Unisphere", at: off(300), tall: true },
      ],
    }, at);
    expect(w).toEqual({ street: "Queens Blvd", near: ["Aldi", "Chase"] });
    expect(walkLine(w)).toBe("On Queens Blvd · near Aldi, Chase");
  });

  it("falls back to a tall landmark in view, and to nothing far away", () => {
    expect(walkPlace({ streets: null, corner: null, landmarks: [{ name: "Unisphere", at: off(300), tall: true }] }, at).near).toEqual(["Unisphere"]);
    expect(walkPlace({ streets: null, corner: null, landmarks: [{ name: "Empire State Building", at: off(800), tall: true }] }, at).near).toEqual([]);
  });

  it("leaves out the destination itself", () => {
    const place = { streets: ["Junction Blvd"] as [string], corner: null, landmarks: [{ name: "Aldi", at: off(5), tall: false }, { name: "Gong Cha", at: off(20), tall: false }] };
    expect(walkPlace(place, at, "aldi").near).toEqual(["Gong Cha"]);
  });

  it("says nothing when the map has nothing", () => {
    expect(walkLine(walkPlace({ streets: null, corner: null, landmarks: [] }, at))).toBeNull();
    expect(walkLine(null)).toBeNull();
  });
});
