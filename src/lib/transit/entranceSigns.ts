/** Subway entrance sign data (public/transit/entrance-signs.json, built from data.ny.gov i9wp-a4ja). Pure. */
export type EntranceRow = {
  gtfs_stop_id?: string;
  stop_name?: string;
  constituent_station_name?: string;
  daytime_routes?: string;
  entry_allowed?: string;
  exit_allowed?: string;
  entrance_latitude?: string;
  entrance_longitude?: string;
};
/** What an entrance sign says: station name, the routes it leads to, and an optional note. */
export type EntranceSign = { name: string; routes: string[]; note?: string };
export type EntranceSigns = {
  /** GTFS stop id -> station name and complex routes. */
  stations: Record<string, { n: string; r: string }>;
  /** "lon,lat" (5 dp) of entrances you cannot enter by. */
  exitOnly: Record<string, 1>;
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
export const entranceKey = (lon: number, lat: number) => `${r5(lon)},${r5(lat)}`;

/** Order bullets like MTA signs: numbers, then letters, shuttle last. */
export function sortRoutes(routes: string[]): string[] {
  const rank = (r: string) => (r === "S" ? 2 : /^\d/.test(r) ? 0 : 1);
  return [...new Set(routes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "en", { numeric: true }));
}

export function signsFromRows(rows: EntranceRow[]): EntranceSigns {
  const stations: EntranceSigns["stations"] = {}, exitOnly: EntranceSigns["exitOnly"] = {};
  for (const e of rows) {
    if (!e.gtfs_stop_id) continue;
    const routes = sortRoutes((e.daytime_routes ?? "").split(/\s+/).filter(Boolean));
    const prev = stations[e.gtfs_stop_id];
    // Rows of one stop agree; keep the longest route list if they ever differ.
    if (!prev || routes.join(" ").length > prev.r.length) stations[e.gtfs_stop_id] = { n: (e.constituent_station_name || e.stop_name || "").trim(), r: routes.join(" ") };
    if (e.entry_allowed === "NO" && e.exit_allowed === "YES" && e.entrance_latitude && e.entrance_longitude)
      exitOnly[entranceKey(Number(e.entrance_longitude), Number(e.entrance_latitude))] = 1;
  }
  return { stations, exitOnly };
}

/** The sign for one entrance; falls back to the GTFS station's name and routes. */
export function signFor(signs: EntranceSigns | undefined, stopId: string, lon: number, lat: number, fallback: { name: string; routes: string }): EntranceSign {
  const s = signs?.stations[stopId];
  const routes = sortRoutes((s?.r || fallback.routes).split(/\s+/).filter(Boolean).map((r) => (r === "GS" || r === "FS" || r === "H" ? "S" : r)));
  const sign: EntranceSign = { name: s?.n || fallback.name, routes };
  if (signs?.exitOnly[entranceKey(lon, lat)]) sign.note = "Exit only";
  return sign;
}
