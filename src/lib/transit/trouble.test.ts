/**
 * Fixtures are real entities from the MTA camsys subway alerts feed and real
 * rows from data.ny.gov 39hk-dx4f, recorded 2026-10-23 (feed header
 * 1792815377). Trimmed to English text; nothing else edited.
 */
import { describe, expect, it } from "vitest";
import { directionSwitches, lineTroubles, otherLinesAt, plainAlertText, rejoinNames, shuttleNotes, shuttleOf, stuckTrains, troubleFromAlert, troubleSummary, type FeedAlert, type LiveVehicle, type TroubleStation } from "./trouble";

type Row = [string, string, string, string, number, number, string, string];
const ROWS: Row[] = [["F21", "237", "Carroll St", "F G", -73.99505, 40.6803, "Northbound", "Southbound"], ["F20", "236", "Bergen St", "F G", -73.99086, 40.68615, "Northbound", "Southbound"], ["A42", "175", "Hoyt-Schermerhorn Sts", "A C G", -73.985, 40.68848, "Westbound", "Queens"], ["G36", "292", "Fulton St", "G", -73.97537, 40.68712, "Queens", "Southbound"], ["G35", "291", "Clinton-Washington Avs", "G", -73.96684, 40.68809, "Queens", "Southbound"], ["G34", "290", "Classon Av", "G", -73.96007, 40.68887, "Queens", "Southbound"], ["A41", "636", "Jay St-MetroTech", "A C F", -73.98734, 40.69234, "Manhattan", "Outbound"], ["D43","58", "Coney Island-Stillwell Av", "D F N Q", -73.98123, 40.57742, "Manhattan", "Last Stop"], ["D03", "211", "Bedford Park Blvd", "B D", -73.88714, 40.87324, "Northbound", "Manhattan"], ["R23", "623", "Canal St", "R W", -74.00177, 40.71953, "Uptown", "Downtown"], ["Q01", "623", "Canal St", "N Q", -74.00046, 40.71838, "Uptown", "Downtown"], ["R33", "608", "4 Av-9 St", "R", -73.9883, 40.67085, "Manhattan", "Southbound"], ["R41", "35", "59 St", "N R", -74.01788, 40.64136, "Manhattan", "Southbound"], ["R44", "38", "86 St", "R", -74.0284, 40.62269, "Manhattan", "Bay Ridge"], ["D25", "41", "7 Av", "B Q", -73.97237, 40.67705, "Manhattan", "Southbound"], ["D28", "44", "Church Av", "B Q", -73.96298, 40.65053, "Manhattan", "Southbound"], ["B13", "60", "Fort Hamilton Pkwy", "D", -73.9943, 40.64091, "Manhattan", "Southbound"], ["N03", "72", "Fort Hamilton Pkwy", "N", -74.00535, 40.63139, "Manhattan", "Coney Island"], ["N10", "79", "86 St", "N", -73.97823, 40.59272, "Manhattan", "Coney Island"], ["M20", "623", "Canal St", "J Z", -73.99989, 40.71809, "Brooklyn", "Downtown"], ["A15", "153", "125 St", "A C B D", -73.95234, 40.81111, "Uptown", "Downtown"], ["A16", "154", "116 St", "C B", -73.95488, 40.80508, "Uptown", "Downtown"], ["A17", "155", "Cathedral Pkwy (110 St)", "C B", -73.95816, 40.8006, "Uptown", "Downtown"], ["A18", "156", "103 St", "C B", -73.96145, 40.79609, "Uptown", "Downtown"], ["A19", "157", "96 St", "C B", -73.9647, 40.79164, "Uptown", "Downtown"], ["A20", "158", "86 St", "C B", -73.96892, 40.78587, "Uptown", "Downtown"], ["A21", "159", "81 St-Museum of Natural History", "C B", -73.97214, 40.78143, "Uptown", "Downtown"], ["A22", "160", "72 St", "C B", -73.97641, 40.77559, "Uptown", "Downtown"], ["A24", "614", "59 St-Columbus Circle", "A C B D", -73.98174, 40.7683, "Uptown", "Downtown"], ["A34", "169", "Canal St", "A C E", -74.00523, 40.72082, "Uptown", "Downtown"], ["H12", "200", "Beach 90 St", "A S", -73.81364, 40.58803, "Inbound", "Rockaway Park"], ["H13", "201", "Beach 98 St", "A S", -73.82056, 40.58531, "Inbound", "Rockaway Park"], ["H14", "202", "Beach 105 St", "A S", -73.82756, 40.58321, "Inbound", "Rockaway Park"], ["H15", "203", "Rockaway Park-Beach 116 St", "A S", -73.83559, 40.5809, "Inbound", "Last Stop"], ["H06", "204", "Beach 67 St", "A", -73.79692, 40.59093, "Manhattan", "Far Rockaway"], ["F22", "238", "Smith-9 Sts", "F G", -73.99596, 40.67358, "Northbound", "Southbound"], ["F23", "608", "4 Av-9 St", "F G", -73.98978, 40.67027, "Northbound", "Southbound"], ["F24", "240", "7 Av", "F G", -73.98031, 40.66627, "Northbound", "Southbound"], ["F25", "241", "15 St-Prospect Park", "F G", -73.97949, 40.66036, "Northbound", "Southbound"], ["F26", "242", "Fort Hamilton Pkwy", "F G", -73.97578, 40.65078, "Northbound", "Southbound"], ["F27", "243", "Church Av", "F G", -73.97968, 40.64404, "Northbound", "Southbound"], ["D14", "277", "7 Av", "E B D", -73.98164, 40.76286, "Outbound", "Downtown"], ["G22", "606", "Court Sq", "G", -73.94383, 40.74655, "Last Stop", "Brooklyn"], ["G24", "282", "21 St", "G", -73.94972, 40.74406, "Court Square", "Brooklyn"], ["G26", "283", "Greenpoint Av", "G", -73.95445, 40.73135, "Queens", "Southbound"], ["G28", "284", "Nassau Av", "G", -73.95128, 40.72463, "Queens", "Southbound"], ["G29", "629", "Metropolitan Av", "G", -73.95142, 40.71279, "Queens", "Southbound"], ["G30", "286", "Broadway", "G", -73.95031, 40.70609, "Queens", "Southbound"], ["G31", "287", "Flushing Av", "G", -73.95023, 40.70038, "Queens", "Southbound"], ["G32", "288", "Myrtle-Willoughby Avs", "G", -73.94905, 40.69457, "Queens", "Southbound"], ["G33", "289", "Bedford-Nostrand Avs", "G", -73.95352, 40.68963, "Queens", "Southbound"], ["116", "306", "125 St", "1", -73.95837, 40.81558, "Uptown", "Downtown"], ["121", "311", "86 St", "1", -73.97622, 40.78864, "Uptown", "Downtown"], ["125", "614", "59 St-Columbus Circle", "1", -73.98193, 40.76825, "Uptown", "Downtown"], ["135", "325", "Canal St", "1", -74.00628, 40.72285, "Uptown", "Downtown"], ["244", "356", "Church Av", "2 5", -73.94957, 40.65084, "Manhattan", "Flatbush"], ["621", "392", "125 St", "4 5 6", -73.93759, 40.80414, "The Bronx", "Downtown"], ["622", "393", "116 St", "6", -73.94162, 40.79863, "The Bronx", "Downtown"], ["623", "394", "110 St", "6", -73.94425, 40.79502, "The Bronx", "Downtown"], ["624", "395", "103 St", "6", -73.94748, 40.7906, "The Bronx", "Downtown"], ["625", "396", "96 St", "6", -73.95107, 40.78567, "The Bronx", "Downtown"], ["626", "397", "86 St", "4 5 6", -73.95559, 40.77949, "Uptown", "Downtown"], ["627", "398", "77 St", "6", -73.95987, 40.77362, "Uptown", "Downtown"], ["628", "399", "68 St-Hunter College", "6", -73.96387, 40.76814, "Uptown", "Downtown"], ["629", "613", "59 St", "4 5 6", -73.96797, 40.76253, "Uptown", "Downtown"], ["630", "612", "51 St", "6", -73.97192, 40.75711, "Uptown", "Downtown"], ["631", "610", "Grand Central-42 St", "4 5 6", -73.97685, 40.75178, "Uptown", "Downtown"], ["639", "623", "Canal St", "6", -74.00019, 40.7188, "Uptown", "Downtown"], ["225", "439", "125 St", "2 3", -73.94549, 40.80775, "Uptown", "Downtown"], ["719", "606", "Court Sq", "7", -73.94526, 40.74702, "Outbound", "Manhattan"], ["723", "610", "Grand Central-42 St", "7", -73.97604, 40.75143, "Queens", "Hudson Yards"], ["901", "610", "Grand Central-42 St", "S", -73.97919, 40.75277, "Times Square", "Last Stop"], ["Q04", "476", "86 St", "Q", -73.95179, 40.77789, "Uptown", "Downtown"]];
const stations: TroubleStation[] = ROWS.map(([gtfsId, complexId, name, routes, lon, lat, north, south]) => ({ gtfsId, complexId, name, routes: routes.split(" "), at: [lon, lat], north, south }));

const ALERTS = {
  // Recorded 2026-10-24 00:39: a suspension whose entities also cover a section where the G still runs.
  gTwoSections: {"id": "lmm:planned_work:34600", "alert": {"active_period": [{"start": 1792805400, "end": 1793005200}], "informed_entity": [{"route_id": "G", "stop_id": "F27"}, {"route_id": "G", "stop_id": "F26"}, {"route_id": "G", "stop_id": "F25"}, {"route_id": "G", "stop_id": "F24"}, {"route_id": "G", "stop_id": "F23"}, {"route_id": "G", "stop_id": "F22"}, {"route_id": "G", "stop_id": "F21"}, {"route_id": "G", "stop_id": "F20"}, {"route_id": "G", "stop_id": "A42"}, {"route_id": "G", "stop_id": "G36"}, {"route_id": "G", "stop_id": "G35"}, {"route_id": "G", "stop_id": "G34"}, {"route_id": "G", "stop_id": "G33"}], "header_text": {"translation": [{"text": "In Brooklyn, no [G] between Hoyt-Schermerhorn Sts and Church Av\nTrains run every 20 minutes between Bedford-Nostrand Avs and Hoyt-Schermerhorn Sts", "language": "en"}]}, "description_text": {"translation": [{"text": "[G] runs in two sections:\n1. Between Court Sq and Bedford-Nostrand Avs\n2. Between Bedford-Nostrand Avs and Hoyt-Schermerhorn Sts\n(All trains board/depart from the Court Sq-bound platform between Bedford-Nostrand Avs and Hoyt-Schermerhorn Sts)\nTransfer at Bedford-Nostrand Avs to continue your trip.\nFor Bergen St *, Carroll St *, Smith-9 Sts *, 4 Av-9 St *, 7 Av, 15 St-Prospect Park *, Fort Hamilton Pkwy * and Church Av. Take the [F] instead.\nTransfer between [G] and [A][C] trains at Hoyt-Schermerhorn Sts\nTransfer between [A][C] and [F] trains at Jay St-MetroTech\n*Only Manhattan-bound service during this time.", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Part Suspended"}}} as FeedAlert,
  delayNQ: {"id": "lmm:alert:273280:26", "alert": {"active_period": [{"start": 1792813698}], "informed_entity": [{"route_id": "N"}, {"route_id": "Q"}], "header_text": {"translation": [{"text": "Downtown [N][Q] trains are running with delays after FDNY extinguished a track fire earlier at Canal St.", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Delays"}}} as FeedAlert,
  gSuspended: {"id": "lmm:planned_work:35870", "alert": {"active_period": [{"start": 1793673900, "end": 1793700000}], "informed_entity": [{"route_id": "G", "stop_id": "G22"}, {"route_id": "G", "stop_id": "G24"}, {"route_id": "G", "stop_id": "G26"}, {"route_id": "G", "stop_id": "G28"}, {"route_id": "G", "stop_id": "G29"}, {"route_id": "G", "stop_id": "G30"}, {"route_id": "G", "stop_id": "G31"}, {"route_id": "G", "stop_id": "G32"}, {"route_id": "G", "stop_id": "G33"}], "header_text": {"translation": [{"text": "No [G] between Bedford-Nostrand Avs and Court Sq", "language": "en"}]}, "description_text": {"translation": [{"text": "[G] runs between Church Av and Bedford-Nostrand Avs, the last stop.\n\n[shuttle bus icon] Free T403 shuttle buses make stops between Bedford-Nostrand Avs and Court Sq.\nTransfer between [G] and [shuttle bus icon] at Bedford-Nostrand Avs.\nWhat's happening?\nStructural maintenance\n\n[accessibility icon] This service change affects one or more ADA accessible stations and these travel alternatives may not be fully accessible. Please contact 511 to plan your trip.", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Part Suspended", "station_alternative": [{"affected_entity": {"stop_id": "G33"}, "notes": {"translation": [{"text": "[G]\n[shuttle bus icon] Lafayette Av at Nostrand Av\n\nIf you're exiting at this station, get a GO ticket for re-entry into the subway.", "language": "en"}]}}, {"affected_entity": {"stop_id": "G32"}, "notes": {"translation": [{"text": "[shuttle bus icon] Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)\n[shuttle bus icon] Marcy Av at Willoughby Av (to Court Sq)", "language": "en"}]}}, {"affected_entity": {"stop_id": "G31"}, "notes": {"translation": [{"text": "[shuttle bus icon] Lee Av at Flushing Av (to Bedford-Nostrand Avs)\n[shuttle bus icon] Marcy Av at Flushing Av (to Court Sq)", "language": "en"}]}}, {"affected_entity": {"stop_id": "G30"}, "notes": {"translation": [{"text": "[shuttle bus icon] Union Av at Broadway", "language": "en"}]}}, {"affected_entity": {"stop_id": "G29"}, "notes": {"translation": [{"text": "[accessibility icon] | [L] (Lorimer St)\n[shuttle bus icon] Union Av at Metropolitan Av\n\nIf you're exiting at this station, get a GO ticket for re-entry into the subway.", "language": "en"}]}}, {"affected_entity": {"stop_id": "G28"}, "notes": {"translation": [{"text": "[shuttle bus icon] Manhattan Av at Nassau Av", "language": "en"}]}}, {"affected_entity": {"stop_id": "G26"}, "notes": {"translation": [{"text": "[shuttle bus icon] Manhattan Av at India St (to Bedford-Nostrand Avs)\n[shuttle bus icon] Manhattan Av at Greenpoint Av (to Bedford-Nostrand Avs)\n[shuttle bus icon] Greenpoint Av at Leonard St (to Court Sq)", "language": "en"}]}}, {"affected_entity": {"stop_id": "G24"}, "notes": {"translation": [{"text": "[shuttle bus icon] Jackson Av at 47 Av (to Bedford-Nostrand Avs)\n[shuttle bus icon] Jackson Av at 21 St (to Court Sq)", "language": "en"}]}}, {"affected_entity": {"stop_id": "G22"}, "notes": {"translation": [{"text": "[accessibility icon] (E, southbound) | [7][E]\n[shuttle bus icon] Jackson Av at 23 St\n[shuttle bus icon] Jackson Av at 45 Av\n\nIf you're exiting at this station, get a GO ticket for re-entry into the subway.", "language": "en"}]}}]}}} as FeedAlert,
  fgSkip: {"id": "lmm:planned_work:35911", "alert": {"active_period": [{"start": 1794925800, "end": 1794947400}], "informed_entity": [{"route_id": "F", "stop_id": "F23", "direction_id": 1}, {"route_id": "F", "stop_id": "F25", "direction_id": 1}, {"route_id": "G", "stop_id": "F23", "direction_id": 1}, {"route_id": "G", "stop_id": "F25", "direction_id": 1}], "header_text": {"translation": [{"text": "In Brooklyn, some Coney Island-bound [F] and some Church Av-bound [G] trains will skip 4 Av/9 St, 15 St-Prospect Park, and Fort Hamilton Pkwy", "language": "en"}]}, "description_text": {"translation": [{"text": "Some Coney Island-bound [F] trains and some Church Av-bound [G] trains will continue to serve these stops.\n\nListen to announcements to hear how your train will run.\n\nIf your stop is skipped, take a Manhattan-bound [F] or Court Sq-bound [G] train.\n\nWhat's happening?\nWe're replacing tracks", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Stops Skipped"}}} as FeedAlert,
  cSkip: {"id": "lmm:planned_work:35657", "alert": {"active_period": [{"start": 1793677500, "end": 1793680200}], "informed_entity": [{"route_id": "C", "stop_id": "A24", "direction_id": 0}, {"route_id": "C", "stop_id": "A22", "direction_id": 0}, {"route_id": "C", "stop_id": "A21", "direction_id": 0}, {"route_id": "C", "stop_id": "A20", "direction_id": 0}, {"route_id": "C", "stop_id": "A19", "direction_id": 0}, {"route_id": "C", "stop_id": "A18", "direction_id": 0}, {"route_id": "C", "stop_id": "A17", "direction_id": 0}, {"route_id": "C", "stop_id": "A16", "direction_id": 0}, {"route_id": "C", "stop_id": "A15", "direction_id": 0}], "header_text": {"translation": [{"text": "In Manhattan, uptown [C] skips 72 St, 81 St, 86 St, 96 St, 103 St, 110 St and 116 St", "language": "en"}]}, "description_text": {"translation": [{"text": "For service to these stations, take the [C] to 125 St and transfer to a downtown [C].\n\nFor service from these stations, take the [C] to 59 St-Columbus Circle and transfer to an uptown [C].\n\nSchedule reminder: [C] does not operate overnight.\n\nTravel tip:\nUse nearby [1] stations instead. Transfer between trains at 59 St-Columbus Circle or 168 St.\n\nWhat's happening?\nWe're replacing tracks", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Stops Skipped"}}} as FeedAlert,
  lex46Skip: {"id": "lmm:planned_work:35386", "alert": {"active_period": [{"start": 1794019500, "end": 1794218400}], "informed_entity": [{"route_id": "4", "stop_id": "621", "direction_id": 1}, {"route_id": "4", "stop_id": "622", "direction_id": 1}, {"route_id": "4", "stop_id": "623", "direction_id": 1}, {"route_id": "4", "stop_id": "624", "direction_id": 1}, {"route_id": "4", "stop_id": "625", "direction_id": 1}, {"route_id": "4", "stop_id": "626", "direction_id": 1}, {"route_id": "4", "stop_id": "627", "direction_id": 1}, {"route_id": "4", "stop_id": "628", "direction_id": 1}, {"route_id": "4", "stop_id": "629", "direction_id": 1}, {"route_id": "4", "stop_id": "630", "direction_id": 1}, {"route_id": "4", "stop_id": "631", "direction_id": 1}, {"route_id": "6", "stop_id": "621", "direction_id": 1}, {"route_id": "6", "stop_id": "622", "direction_id": 1}, {"route_id": "6", "stop_id": "623", "direction_id": 1}, {"route_id": "6", "stop_id": "624", "direction_id": 1}, {"route_id": "6", "stop_id": "625", "direction_id": 1}, {"route_id": "6", "stop_id": "626", "direction_id": 1}, {"route_id": "6", "stop_id": "627", "direction_id": 1}, {"route_id": "6", "stop_id": "628", "direction_id": 1}, {"route_id": "6", "stop_id": "629", "direction_id": 1}, {"route_id": "6", "stop_id": "630", "direction_id": 1}, {"route_id": "6", "stop_id": "631", "direction_id": 1}], "header_text": {"translation": [{"text": "In Manhattan, downtown [4] local and [6] skip 116 St, 110 St, 103 St, 96 St, 77 St, 68 St and 51 St", "language": "en"}]}, "description_text": {"translation": [{"text": "For service to these stations, take the [4] or [6] to 59 St or Grand Central-42 St [accessibility icon] and transfer to an uptown [4] local or [6].\n\nFor service from these stations, take the [4] or [6] to 59 St or 125 St [accessibility icon] and transfer to a downtown [4] or [6].\n\nTravel tip:\nTransfer between uptown and downtown trains with fare-capped OMNY at 86 St.\n\nSchedule reminder: [4] does not serve these local stations days and evenings.\n\nWhat's happening?\nWe're replacing tracks\n\n[accessibility icon] This service change affects one or more ADA accessible stations and these travel alternatives may not be fully accessible. Please contact 511 to plan your trip.", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Stops Skipped"}}} as FeedAlert,
  hShuttle: {"id": "lmm:planned_work:35775", "alert": {"active_period": [{"start": 1795236300, "end": 1795428000}], "informed_entity": [{"route_id": "H", "stop_id": "H12"}, {"route_id": "H", "stop_id": "H13"}, {"route_id": "H", "stop_id": "H14"}, {"route_id": "H", "stop_id": "H15"}], "header_text": {"translation": [{"text": "In Southeast Queens, [H] Rockaway Park Shuttle is replaced by free shuttle buses", "language": "en"}]}, "description_text": {"translation": [{"text": "[shuttle bus icon] Free T351 shuttle buses make stops between Beach 67 St [A] and Rockaway Park-Beach 116 St.\n\nFor Broad Channel, take the [A].\nTransfer between [A] and [shuttle bus icon] buses at Beach 67 St [accessibility icon].\nWhat's happening?\nTrack maintenance", "language": "en"}]}, "transit_realtime.mercury_alert": {"alert_type": "Planned - Suspended", "station_alternative": [{"affected_entity": {"stop_id": "H06"}, "notes": {"translation": [{"text": "[accessibility icon] | [A]\n[shuttle bus icon] Rockaway Beach Blvd at Beach 67 St", "language": "en"}]}}, {"affected_entity": {"stop_id": "H12"}, "notes": {"translation": [{"text": "[shuttle bus icon] Rockaway Beach Blvd at Beach 88 St", "language": "en"}]}}, {"affected_entity": {"stop_id": "H13"}, "notes": {"translation": [{"text": "[shuttle bus icon] Rockaway Beach Blvd at Beach 98 St", "language": "en"}]}}, {"affected_entity": {"stop_id": "H14"}, "notes": {"translation": [{"text": "[shuttle bus icon] Rockaway Beach Blvd at Beach 105 St", "language": "en"}]}}, {"affected_entity": {"stop_id": "H15"}, "notes": {"translation": [{"text": "[shuttle bus icon] Beach 116 St at station entrance", "language": "en"}]}}]}}} as FeedAlert,
};

const at = (a: FeedAlert) => (a.alert.active_period?.[0]?.start ?? 0) + 60;
const names = (xs: Array<{ name: string }>) => xs.map((x) => x.name);
const one = (a: FeedAlert, route: string) => troubleFromAlert(a, stations, at(a)).find((t) => t.route === route)!;

describe("troubleFromAlert on recorded MTA alerts", () => {
  it("drops an alert outside its active period", () => {
    expect(troubleFromAlert(ALERTS.cSkip, stations, at(ALERTS.cSkip) - 3600)).toEqual([]);
  });

  it("live delay: names the station the problem is at, one trouble per line", () => {
    const ts = troubleFromAlert(ALERTS.delayNQ, stations, at(ALERTS.delayNQ));
    expect(ts.map((t) => [t.route, t.kind, t.direction])).toEqual([["N", "delay", "Downtown"], ["Q", "delay", "Downtown"]]);
    expect(ts[0].problemAt).toEqual([{ id: "Q01", name: "Canal St", at: [-74.00046, 40.71838] }]);
    expect(ts[0].headline).toBe("Downtown N/Q trains are running with delays after FDNY extinguished a track fire earlier at Canal St.");
  });

  it("skips: the headline's stations, not the entity stop ids (which include the boundary stations)", () => {
    const c = one(ALERTS.cSkip, "C");
    expect(c.kind).toBe("skip");
    expect(c.direction).toBe("Uptown");
    expect(names(c.skipped)).toEqual(["72 St", "81 St-Museum of Natural History", "86 St", "96 St", "103 St", "Cathedral Pkwy (110 St)", "116 St"]);
    // The entities also list 59 St-Columbus Circle (A24) and 125 St (A15); the C still stops there.
    expect(c.skipped.map((s) => s.id)).not.toContain("A24");
    expect(c.skipped.map((s) => s.id)).not.toContain("A15");
  });

  it("skips: each line keeps its own direction and 'some trains' is kept", () => {
    const f = one(ALERTS.fgSkip, "F"), g = one(ALERTS.fgSkip, "G");
    expect([f.direction, g.direction]).toEqual(["Coney Island-bound", "Church Av-bound"]);
    expect(f.partial).toBe(true);
    // The headline names Fort Hamilton Pkwy although the entities omit it.
    expect(names(f.skipped)).toEqual(["4 Av-9 St", "15 St-Prospect Park", "Fort Hamilton Pkwy"]);
    expect(names(g.skipped)).toEqual(names(f.skipped));
  });

  it("skips: lines the headline's bullets miss ('[4] local and [6] skip') still get the list", () => {
    expect(names(one(ALERTS.lex46Skip, "6").skipped)).toContain("68 St-Hunter College");
    // 68 St lists only the 6 as a daytime route, so the late-night 4 local cannot be matched there.
    expect(names(one(ALERTS.lex46Skip, "4").skipped)).not.toContain("68 St-Hunter College");
    expect(names(one(ALERTS.lex46Skip, "4").skipped)).toContain("96 St");
  });

  it("suspension with shuttle buses: stations without trains, bus stops in the MTA's words, where to rejoin", () => {
    const g = one(ALERTS.gSuspended, "G");
    expect(g.kind).toBe("suspended");
    expect(names(g.skipped)).toEqual(["Court Sq", "21 St", "Greenpoint Av", "Nassau Av", "Metropolitan Av", "Broadway", "Flushing Av", "Myrtle-Willoughby Avs"]);
    expect(g.shuttle?.buses).toEqual(["T403"]);
    expect(names(g.shuttle!.between)).toEqual(["Bedford-Nostrand Avs", "Court Sq"]);
    expect(g.shuttle!.stops.filter((s) => s.station.id === "G32").map((s) => [s.station.name, s.where, s.toward])).toEqual([
      ["Myrtle-Willoughby Avs", "Nostrand Av at Myrtle Av", "Bedford-Nostrand Avs"],
      ["Myrtle-Willoughby Avs", "Marcy Av at Willoughby Av", "Court Sq"],
    ]);
    expect([names(g.rejoin), g.rejoinLine]).toEqual([["Bedford-Nostrand Avs"], "G"]);
  });

  it("suspension: only the headline's stretch, not the section where trains still run every 20 minutes", () => {
    const g = one(ALERTS.gTwoSections, "G");
    expect(names(g.skipped)).toEqual(["Church Av", "Fort Hamilton Pkwy", "15 St-Prospect Park", "7 Av", "4 Av-9 St", "Smith-9 Sts", "Carroll St", "Bergen St"]);
    expect(g.shuttle).toBeNull();
    expect([names(g.rejoin), g.rejoinLine]).toEqual([["Bedford-Nostrand Avs"], "G"]);
    expect(g.headline).toBe("In Brooklyn, no G between Hoyt-Schermerhorn Sts and Church Av. Trains run every 20 minutes between Bedford-Nostrand Avs and Hoyt-Schermerhorn Sts");
    // Which train instead: the F serves every one of them.
    expect(otherLinesAt(g.skipped[0], [g], stations)).toEqual(["F"]);
  });

  it("whole-line shuttle replacement: the rejoin train can be another line", () => {
    const h = one(ALERTS.hShuttle, "H");
    expect(h.shuttle?.buses).toEqual(["T351"]);
    expect(names(h.shuttle!.between)).toEqual(["Beach 67 St", "Rockaway Park-Beach 116 St"]);
    expect([names(h.rejoin), h.rejoinLine]).toEqual([["Beach 67 St"], "A"]);
    expect(troubleSummary(h)).toContain("Get the A train back at Beach 67 St.");
  });
});

describe("where to switch direction (only what the MTA says)", () => {
  it("reads 'take the [C] to 125 St and transfer to a downtown [C]'", () => {
    expect(one(ALERTS.cSkip, "C").switchDirection.map((d) => [d.station.name, d.board, d.why, d.leaveStation])).toEqual([
      ["125 St", "a downtown C", "to", false],
      ["59 St-Columbus Circle", "an uptown C", "from", false],
    ]);
  });
  it("splits 'to 59 St or Grand Central-42 St' and flags a crossover that needs leaving the station", () => {
    const d = one(ALERTS.lex46Skip, "6").switchDirection;
    expect(d.filter((x) => x.why === "to").map((x) => x.station.name)).toEqual(["59 St", "Grand Central-42 St"]);
    expect(d.find((x) => x.why === "crossover")).toMatchObject({ station: { name: "86 St" }, leaveStation: true });
  });
  it("ignores a transfer to a different line (that is not a direction change)", () => {
    const text = "For service to Spring St, take the [C] to W 4 St-Wash Sq and transfer to a downtown [A] or [E].";
    expect(directionSwitches(text, stations)).toEqual([]);
  });
  it("says nothing when the alert gives no switch station", () => {
    expect(one(ALERTS.fgSkip, "F").switchDirection).toEqual([]);
    expect(one(ALERTS.gSuspended, "G").switchDirection).toEqual([]);
  });
});

describe("text helpers", () => {
  it("plain text drops icons and brackets", () => {
    expect(plainAlertText("[shuttle bus icon] Free T403 shuttle buses [accessibility icon] [G][7]")).toBe("Free T403 shuttle buses G/7");
  });
  it("shuttle ends and notes; no shuttle when the alert names none", () => {
    expect(shuttleOf("No [6] between Hunts Point Av and 125 St\nFree T102 shuttle buses make all stops between 125 St and Hunts Point Av.")).toEqual({ any: true, buses: ["T102"], between: ["125 St", "Hunts Point Av"] });
    expect(shuttleOf("Downtown [N][Q] trains are running with delays").any).toBe(false);
    expect(shuttleNotes("[accessibility icon] | [A]\n[shuttle bus icon] Rockaway Beach Blvd at Beach 67 St")).toEqual([{ where: "Rockaway Beach Blvd at Beach 67 St", toward: null }]);
  });
  it("rejoin sentences", () => {
    expect(rejoinNames("Transfer at Myrtle-Wyckoff Avs [accessibility icon] to continue your trip.")).toEqual([{ name: "Myrtle-Wyckoff Avs", lines: [] }]);
  });
});

describe("which train instead", () => {
  it("other lines at a skipped station's complex that are not skipping it", () => {
    const ts = lineTroubles(Object.values(ALERTS), stations, ["N", "Q", "R", "W"], at(ALERTS.delayNQ));
    // Canal St (complex 623): the delay skips nothing, so every line listed there is an option.
    expect(otherLinesAt({ id: "Q01", name: "Canal St", at: [0, 0] }, ts, stations)).toEqual(["6", "J", "N", "Q", "R", "W", "Z"]);
    const g = troubleFromAlert(ALERTS.gSuspended, stations, at(ALERTS.gSuspended));
    expect(otherLinesAt({ id: "G22", name: "Court Sq", at: [0, 0] }, g, stations)).not.toContain("G");
  });
});

describe("stuck trains", () => {
  // Recorded from the NYCT feeds 2026-10-23 (header ~1792816022); ages as observed.
  const now = 1792816022;
  const vehicles: LiveVehicle[] = [
    { tripId: "143600_Q..S39R", route: "Q", stopId: "Q01S", stopped: true, ts: now - 371, remaining: 20, atOrigin: false },
    { tripId: "000600_D..S", route: "D", stopId: "D03S", stopped: true, ts: now - 1195, remaining: 32, atOrigin: false },
    { tripId: "128700_Q..S36R", route: "Q", stopId: "D43S", stopped: true, ts: now - 2853, remaining: 2, atOrigin: false },
    { tripId: "137500_N..N20R", route: "N", stopId: "R03N", stopped: true, ts: now - 9, remaining: 30, atOrigin: false },
  ];
  const troubles = troubleFromAlert(ALERTS.delayNQ, stations, now);
  it("flags a mid-trip train on a delayed line, at its station, with minutes", () => {
    expect(stuckTrains(vehicles, troubles, stations, now)).toEqual([
      { tripId: "143600_Q..S39R", route: "Q", station: { id: "Q01", name: "Canal St", at: [-74.00046, 40.71838] }, toward: "Downtown", stopped: true, stoppedMin: 6 },
    ]);
  });
  it("needs a delay alert on the line (the D sat 20 min with none) and skips terminals", () => {
    const ids = stuckTrains(vehicles, troubles, stations, now).map((s) => s.tripId);
    expect(ids).not.toContain("000600_D..S");
    expect(ids).not.toContain("128700_Q..S36R");
    expect(stuckTrains(vehicles, [], stations, now)).toEqual([]);
  });
  it("a Coney Island terminal is skipped even with stops left", () => {
    expect(stuckTrains([{ ...vehicles[2], remaining: 9 }], troubles, stations, now)).toEqual([]);
  });
});
