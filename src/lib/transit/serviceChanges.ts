/**
 * Station-level service changes parsed from MTA alert text (#253), shared by
 * the map, the station sheet and the trip planner:
 *  - skips: "Flushing-bound [7] skips 52 St and 69 St" (direction-aware;
 *    no direction in the text = both directions);
 *  - platform changes: "All trains at Woodside-61 St board from the
 *    Manhattan-bound platform";
 *  - suspensions: "No [W] between 57 St-7 Av, Manhattan and Astoria-Ditmars
 *    Blvd, Queens" (the two ends; a station closed outright, "No [7] at
 *    Flushing-Main St", is a skip in both directions).
 * A direction is kept as the label the MTA uses ("Flushing", "Manhattan",
 * "Coney Island"); `towardEnd` turns it into an end of the line.
 */
export type ServiceChange = {
  alertId: string;
  route: string;
  kind: "skip" | "platform" | "suspended";
  /** Station names as written in the alert; for a suspension, the two ends of the gap. */
  names: string[];
  /** Direction label the change applies to ("Flushing"), or null for both directions. */
  toward: string | null;
  /** For platform changes: the platform trains board from ("Manhattan"). */
  platform?: string;
  /** Rider-facing notice, e.g. "Flushing-bound trains board from the Manhattan-bound platform". */
  notice: string;
};

type AlertLike = { id: string; text: string; routes: string[] };

const BOROUGH = /^(?:the )?(?:Manhattan|Queens|Brooklyn|Bronx|Staten Island)$/i;
const list = (s: string) => s.replace(/[.]\s*$/, "").replace(/\s+(?:-|–)\s+.*$/, "").split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim().split("/")[0].trim())
  // "… and runs every 16 minutes": a clause, not a station.
  .filter((x) => x && x.length < 60 && /^[A-Z0-9]/.test(x) && !BOROUGH.test(x));
const dirOf = (s: string): string | null => {
  const m = s.match(/(?:^|[\s,])([A-Z0-9][\w.'/]*(?: [A-Z][\w.'/]*){0,2})-bound/);
  if (m) return m[1].replace(/^St\. /, "St ");
  const ud = s.match(/\b(uptown|downtown)\b/i);
  return ud ? ud[1].charAt(0).toUpperCase() + ud[1].slice(1).toLowerCase() : null;
};
const bullets = (s: string) => [...s.matchAll(/\[([A-Z0-9]+)\]/g)].map((m) => m[1]);

export function serviceChanges(a: AlertLike): ServiceChange[] {
  const out: ServiceChange[] = [];
  const route = a.routes[0] ?? "";
  const alertDir = dirOf(a.text.split("\n")[0]);
  for (const line of a.text.split(/\n/)) {
    const skip = line.match(/((?:\[[A-Z0-9]+\](?:,? and |, )?)+)(?: (?:local|express))?(?: trains?)?(?: will)? skips? ([^.\n]+)/);
    if (skip) {
      const before = line.slice(0, skip.index);
      const toward = /both directions/i.test(line) ? null : dirOf(before);
      const names = list(skip[2]);
      const routes = bullets(skip[1]);
      for (const r of routes.length ? routes : [route]) {
        out.push({ alertId: a.id, route: r, kind: "skip", names, toward, notice: `Skipped${toward ? ` ${toward}-bound` : " in both directions"}` });
      }
    }
    // "No Jamaica-bound [F] service at 57 St, …" / "No [7] at Flushing-Main St": closed there.
    const closed = line.match(/(?:^|, )[Nn]o (?:([\w .'/]+?)-bound )?((?:\[[A-Z0-9]+\](?:,? and |, )?)+)(?: trains?| service)? at ([^\n]+)/);
    if (closed) {
      const toward = closed[1] ?? null;
      for (const r of bullets(closed[2])) out.push({ alertId: a.id, route: r, kind: "skip", names: list(closed[3]), toward, notice: `No ${toward ? `${toward}-bound ` : ""}${r} trains` });
    }
    // "No [W] between 57 St-7 Av, Manhattan and Astoria-Ditmars Blvd, Queens - take the [N] instead"
    const gap = line.match(/(?:^|, )[Nn]o ((?:\[[A-Z0-9]+\](?:,? and |, )?)+)(?: trains?| service)? between (.+?)(?:, (?:the )?(?:Manhattan|Queens|Brooklyn|Bronx|Staten Island))? and ([^\n]+)/);
    if (gap) {
      const ends = [list(gap[2])[0], list(gap[3])[0]].filter(Boolean);
      if (ends.length === 2) for (const r of bullets(gap[1])) out.push({ alertId: a.id, route: r, kind: "suspended", names: ends, toward: null, notice: `No ${r} trains between ${ends[0]} and ${ends[1]}` });
    }
    const plat = line.match(/(?:(?:all|some)\s+)?((?:\[[A-Z0-9]+\])*)\s*(?:trains? )?at ([^\n]+?) board from the ([\w .'/]+?)-bound platform/i)
      // "All trains board from the Manhattan-bound platform at Burnside Av" / "All [SIR] trains from Eltingville to Huguenot board from …"
      ?? line.match(/(?:all|some)\s+((?:\[[A-Z0-9]+\])*)\s*trains? (?:from (.+?) to (.+?) )?board from the ([\w .'/]+?)-bound platform(?: at ([^\n.]+))?/i);
    if (plat) {
      const reversed = plat.length > 4;
      const names = reversed ? (plat[5] ? list(plat[5]) : [plat[2], plat[3]].filter(Boolean).map((n) => n.replace(/^St\. /, "St "))) : list(plat[2]);
      const platform = (reversed ? plat[4] : plat[3]).trim();
      const cut = reversed ? plat.index! : plat.index! + plat[0].indexOf(" at ");
      const lead = dirOf(line.slice(0, cut));
      // "All trains at X board from the Manhattan-bound platform" in a Flushing-bound alert: the Flushing-bound riders are the ones moved.
      const toward = lead ?? (alertDir && alertDir !== platform ? alertDir : null);
      const who = toward ? `${toward}-bound trains` : `All ${route} trains`.replace("  ", " ");
      if (names.length) out.push({ alertId: a.id, route, kind: "platform", names, toward, platform, notice: `${who} board from the ${platform}-bound platform${reversed && plat[2] ? ` between ${names[0]} and ${names[1]}` : ""}` });
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "av").replace(/[^a-z0-9]/g, "");
/** Does an alert's station name refer to this station name? */
export function sameStation(alertName: string, stationName: string): boolean {
  const w = norm(alertName), n = norm(stationName);
  if (w === n || (w.length > 4 && (n.startsWith(w) || w.startsWith(n)))) return true;
  // Word order differs between feeds: "Woodside-61 St" vs "61 St-Woodside".
  const tok = (s: string) => new Set(s.toLowerCase().replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "av").split(/[^a-z0-9]+/).filter(Boolean));
  const a = tok(alertName), b = tok(stationName);
  return a.size > 1 && [...a].every((t) => b.has(t)) && [...a].some((t) => /\d|[a-z]{4,}/.test(t) && t !== "st" && t !== "av");
}

type Pt = readonly [number, number];
/** Rough Manhattan box, for "Manhattan-bound". */
export const inManhattan = (p: Pt): boolean => p[0] < -73.93 && p[0] > -74.03 && p[1] > 40.698 && p[1] < 40.88 && !(p[0] > -73.96 && p[1] < 40.735);

/**
 * Which end of a line a direction label points to: the terminal whose name
 * starts with the label ("Flushing" -> Flushing-Main St), or for "Manhattan"
 * the end inside Manhattan. Returns 0 or 1 (index into `ends`), or null.
 */
export function towardEnd(label: string | null, ends: ReadonlyArray<{ name: string; at: Pt }>): 0 | 1 | null {
  if (!label || ends.length !== 2) return null;
  for (const i of [0, 1] as const) if (norm(ends[i].name).startsWith(norm(label))) return i;
  if (/manhattan/i.test(label)) {
    const m = ends.map((e) => inManhattan(e.at));
    if (m[0] !== m[1]) return m[0] ? 0 : 1;
  }
  return null;
}
/** The label riders use for the other direction ("Manhattan" for a Flushing skip). */
export function otherDirection(label: string, ends: ReadonlyArray<{ name: string; at: Pt }>): string {
  const i = towardEnd(label, ends);
  if (i === null) return "other direction";
  const o = ends[1 - i];
  return inManhattan(o.at) && !inManhattan(ends[i].at) ? "Manhattan" : o.name.split(/[-/]/)[0].trim();
}
