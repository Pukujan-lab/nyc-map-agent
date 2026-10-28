import { describe, expect, it } from "vitest";
import { pushCard } from "./leftColumn";

describe("pushCard", () => {
  it("puts a new card on top", () => {
    expect(pushCard(["map:a"], "line:M")).toEqual(["map:a", "line:M"]);
  });
  it("brings a card already under another back to the top, once", () => {
    expect(pushCard(["line:M", "map:a"], "line:M")).toEqual(["map:a", "line:M"]);
  });
});
