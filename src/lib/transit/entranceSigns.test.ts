import { describe, expect, it } from "vitest";
import { signFor, signsFromRows, sortRoutes } from "./entranceSigns";
import { routeFace } from "./bullets";
import { bulletRows } from "../map/threeLayer";

describe("entrance signs", () => {
  const rows = [
    { gtfs_stop_id: "127", stop_name: "Times Sq-42 St/Port Authority Bus Terminal", constituent_station_name: "Times Sq-42 St", daytime_routes: "1 2 3 7 A C E N Q R W S", entry_allowed: "YES", exit_allowed: "YES", entrance_latitude: "40.75525", entrance_longitude: "-73.98736" },
    { gtfs_stop_id: "131", stop_name: "18 St", daytime_routes: "1", entry_allowed: "NO", exit_allowed: "YES", entrance_latitude: "40.74092", entrance_longitude: "-73.99773" },
  ];
  const signs = signsFromRows(rows);
  it("uses the station's own name and the complex's routes", () => {
    expect(signFor(signs, "127", -73.98736, 40.75525, { name: "x", routes: "" })).toEqual({ name: "Times Sq-42 St", routes: ["1", "2", "3", "7", "A", "C", "E", "N", "Q", "R", "W", "S"] });
  });
  it("marks exit-only entrances", () => {
    expect(signFor(signs, "131", -73.99773, 40.74092, { name: "x", routes: "" }).note).toBe("Exit only");
  });
  it("falls back to GTFS name and routes, shuttles as S", () => {
    expect(signFor(signs, "999", 0, 0, { name: "Grand Central-42 St", routes: "GS 4 5 6 7" })).toEqual({ name: "Grand Central-42 St", routes: ["4", "5", "6", "7", "S"] });
  });
  it("orders numbers, letters, shuttle", () => expect(sortRoutes(["S", "Q", "2", "A", "10"])).toEqual(["2", "10", "A", "Q", "S"]));
});

describe("route bullets", () => {
  it("black text on yellow, diamonds for express", () => {
    expect(routeFace("N")).toMatchObject({ darkText: true, color: "#FCCC0A" });
    expect(routeFace("6X")).toMatchObject({ text: "6", express: true, color: "#00933C" });
    expect(routeFace("GS").text).toBe("S");
  });
  it("wraps more than seven bullets to two rows", () => {
    expect(bulletRows(12, 950, 100).rows).toEqual([6, 6]);
    expect(bulletRows(2, 950, 80)).toMatchObject({ rows: [2], r: 80 });
  });
});
