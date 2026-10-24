import { describe, expect, it } from "vitest";
import { localStatus, speechTag, statusKind, statusLang, type StatusKind } from "./statusLines";
import { statusLine } from "./agentSteps";

const KINDS: StatusKind[] = ["trains", "walk", "roads", "place", "restroom", "weather", "elevators", "map", "wait"];

describe("spoken status lines (#370)", () => {
  it("has a line for every kind in every supported language", () => {
    for (const lang of ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"]) {
      for (const k of KINDS) expect(localStatus(k, lang)).toMatch(/\S…$/);
    }
  });

  it("maps tools to kinds, with unknown tools waiting", () => {
    expect(statusKind("transit_plan")).toBe("trains");
    expect(statusKind("hazards")).toBe("weather");
    expect(statusKind("showRoute")).toBe("map");
    expect(statusKind("data_query")).toBe("wait");
    expect(statusKind(undefined)).toBe("wait");
  });

  it("speaks in the language of the browser, and falls back to English", () => {
    expect(localStatus("restroom", "es-US")).toBe("Estoy buscando baños cercanos…");
    expect(localStatus("trains", "fr-CA")).toBe("Je vérifie les trains…");
    expect(localStatus("trains", "de-DE")).toBe("Checking the trains…");
  });

  it("follows the message's script when it is unambiguous", () => {
    expect(statusLang("最近的厕所在哪里", "en-US")).toBe("zh");
    expect(statusLang("где ближайший туалет", "en-US")).toBe("ru");
    expect(statusLang("সবচেয়ে কাছের টয়লেট কোথায়", "en-US")).toBe("bn");
    expect(statusLang("가장 가까운 화장실", "en-US")).toBe("ko");
    expect(statusLang("¿Dónde está el baño?", "en-US")).toBe("es");
    expect(statusLang("Kote twalèt la ye?", "ht")).toBe("ht");
    expect(statusLang("Where is the restroom?", "fr-FR")).toBe("fr");
    expect(statusLang("Where is the restroom?", "de-DE")).toBe("en");
    expect(statusLang("Where is the restroom?")).toBe("en");
  });

  it("keeps the browser's region for its own language in the speech tag", () => {
    expect(speechTag("es", "es-MX")).toBe("es-MX");
    expect(speechTag("zh", "en-US")).toBe("zh");
  });

  it("builds the line from the running step", () => {
    expect(statusLine([{ id: "a", name: "nearest_restroom", status: "start" }], "ko")).toBe("근처 화장실을 찾고 있어요…");
    expect(statusLine([], "es")).toBe("Un momento, estoy en ello…");
  });
});
