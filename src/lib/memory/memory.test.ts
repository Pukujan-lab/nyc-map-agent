import { afterEach, describe, expect, it } from "vitest";
import {
  CHATS_KEY, COMMUTE_KEY, HOME_WORK_KEY, LOOKED_UP_KEY, MEMORY_KINDS, forgetEverything, listStored, readChats, readLookedUp,
  rememberedCount, rememberChat, rememberLookup, remembers, saveHomeWork, setRemembering,
} from "./memory";

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  };
}

const trip = (from: string, to: string) => ({ from: { label: from, at: [-73.98, 40.76] as [number, number] }, to: { label: to, at: [-73.99, 40.74] as [number, number] }, routes: ["A"], mode: "transit" as const });

afterEach(() => {
  const s = fakeStorage();
  for (const k of MEMORY_KINDS) setRemembering(k, k !== "exactLocation", s);
});

describe("what we remember", () => {
  it("keeps the last five trips looked up, newest first, without exact points by default", () => {
    const s = fakeStorage();
    for (let i = 0; i < 7; i++) rememberLookup(trip(`A${i}`, `B${i}`), 1000 + i, s);
    rememberLookup(trip("A3", "B3"), 2000, s);
    const list = readLookedUp(s);
    expect(list).toHaveLength(5);
    expect(list[0].from.label).toBe("A3");
    expect(list[1].from.label).toBe("A6");
    expect(list.every((t) => !t.from.at && !t.to.at)).toBe(true);
  });

  it("keeps exact points only while Exact location is on, and drops them when it goes off", () => {
    const s = fakeStorage();
    setRemembering("exactLocation", true, s);
    rememberLookup(trip("Home", "Work"), 1, s);
    expect(readLookedUp(s)[0].from.at).toEqual([-73.98, 40.76]);
    setRemembering("exactLocation", false, s);
    const [t] = readLookedUp(s);
    expect(t.from).toEqual({ label: "Home" });
    expect(t.to).toEqual({ label: "Work" });
  });

  it("turning a kind off stops recording it and clears it", () => {
    const s = fakeStorage();
    rememberLookup(trip("X", "Y"), 1, s);
    setRemembering("trips", false, s);
    expect(remembers("trips")).toBe(false);
    expect(s.has(LOOKED_UP_KEY)).toBe(false);
    rememberLookup(trip("X", "Y"), 2, s);
    expect(readLookedUp(s)).toEqual([]);
  });

  it("keeps chats for 30 days only", () => {
    const s = fakeStorage();
    const day = 86_400_000;
    rememberChat("old question", 0, s);
    rememberChat("new question", 40 * day, s);
    expect(readChats(40 * day, s).map((c) => c.q)).toEqual(["new question"]);
  });

  it("counts the switches that are on, with Exact location off by default", () => {
    expect(rememberedCount({ rides: true, homeWork: true, chats: true, trips: true, exactLocation: false })).toBe(4);
    expect(rememberedCount({ rides: false, homeWork: false, chats: false, trips: false, exactLocation: false })).toBe(0);
  });

  it("Delete everything clears every kind and See all lists what is kept", () => {
    const s = fakeStorage({
      [COMMUTE_KEY]: JSON.stringify({ work: { route: "A", minutes: 30, board: "59 St-Columbus Circle", transfers: [] } }),
      [HOME_WORK_KEY]: JSON.stringify({ home: { label: "Home", lon: -73.98, lat: 40.76 } }),
    });
    rememberChat("Is the A running?", 5, s);
    rememberLookup(trip("P", "Q"), 5, s);
    expect(listStored(5, s).map((x) => x.kind)).toEqual(["rides", "homeWork", "chats", "trips"]);
    forgetEverything(s);
    for (const k of [COMMUTE_KEY, HOME_WORK_KEY, CHATS_KEY, LOOKED_UP_KEY]) expect(s.has(k)).toBe(false);
    expect(listStored(5, s)).toEqual([]);
  });
});

describe("saving Home and Work", () => {
  it("saves a place as Home and keeps Work alongside it, in the shape the daily card reads", () => {
    const s = fakeStorage({ [HOME_WORK_KEY]: JSON.stringify({ work: { label: "Office", lon: -73.98, lat: 40.75 } }) });
    expect(saveHomeWork("home", { label: "Empire State Building", lon: -73.9857, lat: 40.7484 }, s)).toBe(true);
    expect(JSON.parse(s.getItem(HOME_WORK_KEY)!)).toEqual({ work: { label: "Office", lon: -73.98, lat: 40.75 }, home: { label: "Empire State Building", lon: -73.9857, lat: 40.7484 } });
  });
  it("keeps nothing while Home & Work is switched off", () => {
    const s = fakeStorage();
    setRemembering("homeWork", false, s);
    expect(saveHomeWork("work", { label: "Office", lon: -73.98, lat: 40.75 }, s)).toBe(false);
    expect(s.has(HOME_WORK_KEY)).toBe(false);
  });
});
