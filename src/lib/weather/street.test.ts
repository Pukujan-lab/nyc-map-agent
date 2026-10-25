import { describe, expect, it } from "vitest";
import { atmosphere, coarsen, forecastHour, headsUpFacts, nyHour, precipFromCode, precipitation, recommend, type HourWeather } from "./street";

const hour = (p: Partial<HourWeather> = {}): HourWeather => ({
  time: "2026-10-24T09:00",
  tempC: 20,
  feelsLikeC: 20,
  precipPct: 0,
  precipMm: 0,
  windKmh: 5,
  gustKmh: 10,
  code: 0,
  cloudPct: 0,
  visibilityM: 20000,
  ...p,
});

describe("precipFromCode", () => {
  it("maps WMO codes to rain, snow, sleet or nothing", () => {
    expect(precipFromCode(0).type).toBe("none");
    expect(precipFromCode(3).type).toBe("none");
    expect(precipFromCode(45).type).toBe("none");
    expect(precipFromCode(53).type).toBe("rain");
    expect(precipFromCode(63).type).toBe("rain");
    expect(precipFromCode(81).type).toBe("rain");
    expect(precipFromCode(95).type).toBe("rain");
    expect(precipFromCode(56).type).toBe("sleet");
    expect(precipFromCode(67).type).toBe("sleet");
    expect(precipFromCode(73).type).toBe("snow");
    expect(precipFromCode(86).type).toBe("snow");
    expect(precipFromCode(null).type).toBe("none");
  });

  it("orders intensity light < moderate < heavy", () => {
    expect(precipFromCode(61).intensity).toBeLessThan(precipFromCode(63).intensity);
    expect(precipFromCode(63).intensity).toBeLessThan(precipFromCode(65).intensity);
    expect(precipFromCode(71).intensity).toBeLessThan(precipFromCode(75).intensity);
  });
});

describe("precipitation", () => {
  it("takes intensity from the rate: 8 mm/h rain and 3 mm/h snow are full strength", () => {
    expect(precipitation(63, 8).intensity).toBe(1);
    expect(precipitation(63, 2).intensity).toBeCloseTo(0.25);
    expect(precipitation(73, 3).intensity).toBe(1);
    expect(precipitation(73, 0.6).intensity).toBeCloseTo(0.2);
  });

  it("falls back to the code's guess without a rate", () => {
    expect(precipitation(65, null)).toEqual({ type: "rain", intensity: 0.9 });
    expect(precipitation(65, 0)).toEqual({ type: "rain", intensity: 0.9 });
  });

  it("counts a rate with a dry code as rain, or snow at freezing", () => {
    expect(precipitation(2, 1, 10).type).toBe("rain");
    expect(precipitation(2, 1, -2).type).toBe("snow");
    expect(precipitation(2, 0.05, 10).type).toBe("none");
  });
});

describe("atmosphere", () => {
  it("scales overcast with cloud cover and fog with low visibility", () => {
    expect(atmosphere(100, 20000)).toEqual({ overcast: 1, fog: 0 });
    expect(atmosphere(50, 1000).fog).toBe(1);
    expect(atmosphere(0, 3000).fog).toBeCloseTo(0.5);
    expect(atmosphere(null, null, 45).fog).toBe(0.7);
  });
});

describe("coarsen", () => {
  it("rounds to 0.01 degrees, about a kilometre", () => {
    expect(coarsen(40.75803, -73.98571)).toEqual({ lat: 40.76, lon: -73.99 });
    expect(coarsen(40.7549, -73.984)).toEqual({ lat: 40.75, lon: -73.98 });
  });

  it("keeps every point within ~1 km of the true one", () => {
    const { lat, lon } = coarsen(40.7049999, -73.9949999);
    const dy = (lat - 40.7049999) * 111_000;
    const dx = (lon + 73.9949999) * 111_000 * Math.cos((40.7 * Math.PI) / 180);
    expect(Math.hypot(dx, dy)).toBeLessThan(1000);
  });
});

describe("recommend", () => {
  it("says take an umbrella when rain is likely", () => {
    expect(recommend(hour({ precipPct: 70, code: 61, precipMm: 1 })).text).toBe("Take an umbrella");
    expect(recommend(hour({ precipPct: 50, code: 3 })).text).toBe("Take an umbrella");
  });

  it("swaps the umbrella for a raincoat in strong wind", () => {
    expect(recommend(hour({ precipPct: 80, code: 63, gustKmh: 60 })).kind).toBe("rain");
    expect(recommend(hour({ precipPct: 80, code: 63, gustKmh: 60 })).text).toMatch(/raincoat/);
  });

  it("warns of ice for freezing rain, snow at freezing, or an icy alert", () => {
    expect(recommend(hour({ tempC: 0, code: 67, precipPct: 60 })).text).toBe("Roads and sidewalks may be icy");
    expect(recommend(hour({ tempC: -3, code: 73, precipPct: 80 })).kind).toBe("ice");
    expect(recommend(hour(), ["Winter Weather Advisory: freezing drizzle"]).kind).toBe("ice");
  });

  it("asks for boots for snow above freezing", () => {
    expect(recommend(hour({ tempC: 2, feelsLikeC: -1, code: 71, precipPct: 60 })).text).toBe("Wear boots and a warm coat");
  });

  it("grades cold by the feels-like temperature", () => {
    expect(recommend(hour({ tempC: 2, feelsLikeC: -4 })).text).toBe("Bundle up: hat and gloves");
    expect(recommend(hour({ tempC: 8, feelsLikeC: 6 })).text).toBe("Wear a warm coat");
    expect(recommend(hour({ tempC: 15, feelsLikeC: 14 })).text).toBe("Bring a jacket");
    expect(recommend(hour({ tempC: 15, feelsLikeC: null })).text).toBe("Bring a jacket");
  });

  it("flags heat and strong wind, else no worries", () => {
    expect(recommend(hour({ tempC: 31, feelsLikeC: 35 })).kind).toBe("heat");
    expect(recommend(hour(), ["Heat Advisory"]).kind).toBe("heat");
    expect(recommend(hour({ gustKmh: 55 })).kind).toBe("wind");
    expect(recommend(hour()).text).toBe("No weather worries");
  });
});

describe("forecastHour", () => {
  it("uses the trip's departure hour when it is now or later, else now", () => {
    expect(forecastHour("2026-10-25T09:15", "2026-10-24T18")).toBe("2026-10-25T09");
    expect(forecastHour("2026-10-24T18:40", "2026-10-24T18")).toBe("2026-10-24T18");
    expect(forecastHour("2026-10-23T09:00", "2026-10-24T18")).toBe("2026-10-24T18");
    expect(forecastHour(null, "2026-10-24T18")).toBe("2026-10-24T18");
  });
});

describe("nyHour", () => {
  it("formats the New York local hour, across daylight saving", () => {
    expect(nyHour(new Date("2026-07-01T13:30:00Z"))).toBe("2026-07-01T09");
    expect(nyHour(new Date("2026-12-01T04:59:00Z"))).toBe("2026-11-30T23");
  });
});

describe("headsUpFacts", () => {
  it("lists temperature, precipitation and strong wind only", () => {
    expect(headsUpFacts(hour())).toEqual(["68°F"]);
    expect(headsUpFacts(hour({ tempC: 5, feelsLikeC: 1, precipPct: 60, precipMm: 1.24, code: 63, gustKmh: 48 }))).toEqual([
      "41°F, feels 34°F",
      "60% rain, 1.2 mm",
      "Wind up to 30 mph",
    ]);
  });
});
