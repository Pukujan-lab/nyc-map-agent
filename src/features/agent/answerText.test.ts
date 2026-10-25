import { describe, expect, it } from "vitest";
import { joinSegments, nameLocationButton } from "./answerText";

describe("joinSegments", () => {
  it("drops a piece the next one restates", () => {
    expect(joinSegments([
      "No sé desde dónde me escribes, así que toca Usar mi ubicación.",
      "No sé desde dónde buscas: toca Usar mi ubicación y te digo el baño más cercano.",
    ])).toBe("No sé desde dónde buscas: toca Usar mi ubicación y te digo el baño más cercano.");
  });

  it("keeps different pieces as paragraphs", () => {
    expect(joinSegments(["Let me check the 4.", "The 4 is running with delays."])).toBe("Let me check the 4.\n\nThe 4 is running with delays.");
  });

  it("compares the first characters of unspaced scripts", () => {
    expect(joinSegments(["我需要知道你在哪里。", "我需要知道你的位置才能找厕所。"])).toBe("我需要知道你的位置才能找厕所。");
  });

  it("leaves a single piece as it is", () => {
    expect(joinSegments(["Take the 7.", ""])).toBe("Take the 7.");
  });
});

describe("nameLocationButton", () => {
  it("uses the button's own name when the reply has the button", () => {
    expect(nameLocationButton("Toca Use my location debajo.", true, "Usar mi ubicación")).toBe("Toca Usar mi ubicación debajo.");
  });

  it("leaves English and replies without the button alone", () => {
    expect(nameLocationButton("Tap Use my location.", true, "Use my location")).toBe("Tap Use my location.");
    expect(nameLocationButton("Toca Use my location.", false, "Usar mi ubicación")).toBe("Toca Use my location.");
  });
});
