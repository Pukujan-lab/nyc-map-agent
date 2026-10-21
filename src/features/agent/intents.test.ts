import { describe, expect, it } from "vitest";
import { parseIntent, type Catalog } from "./intents";

const cat: Catalog = {
  stations: [
    { id: "127", name: "Times Sq-42 St", routes: ["1", "2", "3"] },
    { id: "R16", name: "Times Sq-42 St", routes: ["N", "Q", "R", "W"] },
    { id: "631", name: "Grand Central-42 St", routes: ["4", "5", "6"] },
    { id: "L03", name: "14 St-Union Sq", routes: ["L"] },
    { id: "L08", name: "Bedford Av", routes: ["L"] },
    { id: "A41", name: "Jay St-MetroTech", routes: ["A", "C", "F"] },
    { id: "D24", name: "Atlantic Av-Barclays Ctr", routes: ["B", "Q"] },
    { id: "G22", name: "Court Sq", routes: ["G"] },
  ],
  routes: ["1", "2", "3", "4", "5", "6", "7", "A", "C", "F", "G", "L", "N", "Q", "R", "W", "B", "GS"],
};
const p = (s: string) => parseIntent(s, cat);

describe("parseIntent", () => {
  it.each([
    ["When is the next train at Bedford Av?", "L08", null, null],
    ["next train at bedford avenue", "L08", null, null],
    ["When's the next uptown train at Times Square?", "127", null, "uptown"],
    ["next downtown 1 train at times sq 42nd street", "127", "1", "downtown"],
    ["Next Q train at Times Square", "R16", "Q", null],
    ["When does the next L train at Union Square come", "L03", "L", null],
    ["next northbound train at Grand Central", "631", null, "uptown"],
    ["Hey map, next train from Jay Street MetroTech", "A41", null, null],
    ["trains at Court Square", "G22", null, null],
    ["arrivals at Atlantic Avenue Barclays Center", "D24", null, null],
    ["how long until the next southbound train at Bedford", "L08", null, "downtown"],
  ])("arrivals: %s", (q, id, route, dir) => {
    expect(p(q)).toMatchObject({ kind: "arrivals", mode: "train", stationId: id, route, direction: dir });
  });

  it("bus arrivals keep the spoken stop", () => {
    expect(p("next bus at 5th Avenue and 42nd")).toMatchObject({ kind: "arrivals", mode: "bus", place: "5th avenue and 42nd" });
    expect(p("when's the next bus from Flatbush Av")).toMatchObject({ kind: "arrivals", mode: "bus" });
  });

  it.each([
    ["Is the L train running?", "L"],
    ["any delays on the A train", "A"],
    ["service status of the 7", "7"],
    ["what's the status of the Q line", "Q"],
    ["G train status", "G"],
    ["are there problems with the four train", "4"],
  ])("status: %s", (q, route) => expect(p(q)).toEqual({ kind: "status", route }));

  it.each([
    ["Directions to Prospect Park", "prospect park"],
    ["take me to the Metropolitan Museum of Art", "the metropolitan museum of art"],
    ["How do I get to Yankee Stadium?", "yankee stadium"],
    ["navigate to 350 5th Avenue", "350 5th avenue"],
    ["walk me to Washington Square Park", "washington square park"],
  ])("directions: %s", (q, to) => expect(p(q)).toEqual({ kind: "directions", to }));

  it.each(["where's the nearest restroom", "I need a bathroom", "closest public toilet"])("restroom: %s", (q) =>
    expect(p(q)).toEqual({ kind: "restroom" }));

  it.each(["what's the weather", "is it going to rain?", "do I need an umbrella"])("weather: %s", (q) =>
    expect(p(q)).toEqual({ kind: "weather" }));

  it.each([["follow the L train", "L"], ["track the seven train", "7"], ["Follow the A", "A"]])("follow: %s", (q, route) =>
    expect(p(q)).toEqual({ kind: "follow", route }));

  it.each(["stop", "Stop listening", "never mind"])("stop: %s", (q) => expect(p(q)).toEqual({ kind: "stop" }));

  it.each(["write me a poem about cats", "who won the game last night", "what is the capital of France", "status of the Z train"])(
    "no deterministic match: %s",
    (q) => expect(p(q)).toBeNull(),
  );
});
