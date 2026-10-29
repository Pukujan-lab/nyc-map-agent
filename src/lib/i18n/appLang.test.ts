import { describe, expect, it } from "vitest";
import { appLangOf, resolveAppLang, tr } from "./appLang";

describe("app language", () => {
  it("takes the base of a browser tag the app has text for", () => {
    expect(appLangOf("es-US")).toBe("es");
    expect(appLangOf("de-DE")).toBeNull();
  });
  it("prefers the menu pick, then the asked language, then the browser", () => {
    expect(resolveAppLang("fr", "zh", "es")).toBe("fr");
    expect(resolveAppLang(null, "zh", "es")).toBe("zh");
    expect(resolveAppLang(null, null, null)).toBe("en");
  });
  it("has the task buttons in every language", () => {
    expect(tr("zh", "restroom")).toBe("厕所");
    expect(tr("es", "findExit")).toBe("Buscar salida");
  });
  it("has the trip steps in every language, with the stop name kept", () => {
    expect(tr("es", "getOffAt").replace("{s}", "Grand Central")).toBe("Bájate en Grand Central");
    expect(tr("es", "transit")).toBe("Transporte");
    for (const lang of ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const) {
      expect(tr(lang, "getOffAt")).toContain("{s}");
      expect(tr(lang, "nStops")).toContain("{n}");
    }
  });
});
