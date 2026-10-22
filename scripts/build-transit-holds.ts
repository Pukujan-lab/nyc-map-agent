/**
 * Derive express/local transfer stations from the MTA static subway GTFS and
 * write src/features/transit/holds.json (small, committed).
 *
 *   npm run build:transit-holds            # downloads gtfs_subway.zip
 *   GTFS_DIR=/path/to/unzipped npm run build:transit-holds
 *
 * Uses each route+direction's stop patterns from stop_times.txt (mapped to
 * stops.txt parent_station) with at least 5% of that route's trips, then
 * deriveExpressLocal(). `add`/`remove` in holds.json are curated overrides and
 * are preserved. Hold times are estimates: GTFS has no hold flag.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveExpressLocal } from "../src/features/transit/dwell";

const OUT = "src/features/transit/holds.json";

function rows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const hdr = lines[0].replace(/"/g, "").split(",");
  return lines.slice(1).map((l) => {
    const c = l.replace(/"/g, "").split(",");
    return Object.fromEntries(hdr.map((h, i) => [h, c[i] ?? ""]));
  });
}

let dir = process.env.GTFS_DIR;
if (!dir) {
  const work = mkdtempSync(join(tmpdir(), "gtfs-holds-"));
  const res = await fetch("https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip");
  if (!res.ok) throw new Error(`GTFS download ${res.status}`);
  writeFileSync(join(work, "s.zip"), Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", join(work, "s.zip"), "-d", work]);
  dir = work;
}
const root = dir;
const read = (f: string) => readFileSync(join(root, f), "utf8");
const parentOf = new Map(rows(read("stops.txt")).map((s) => [s.stop_id, s.parent_station || s.stop_id]));
const tripKey = new Map(rows(read("trips.txt")).map((t) => [t.trip_id, `${t.route_id}|${t.direction_id}`]));
const seq = new Map<string, Array<[number, string]>>();
for (const r of rows(read("stop_times.txt"))) {
  (seq.get(r.trip_id) ?? seq.set(r.trip_id, []).get(r.trip_id)!).push([Number(r.stop_sequence), parentOf.get(r.stop_id) ?? r.stop_id]);
}
const counts = new Map<string, Map<string, number>>();
for (const [trip, s] of seq) {
  const k = tripKey.get(trip);
  if (!k) continue;
  const pat = s.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(">");
  const m = counts.get(k) ?? counts.set(k, new Map()).get(k)!;
  m.set(pat, (m.get(pat) ?? 0) + 1);
}
const patterns: Array<{ route: string; stops: string[] }> = [];
for (const [k, m] of counts) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  for (const [pat, c] of m) if (c >= total * 0.05) patterns.push({ route: k, stops: pat.split(">") });
}
// Directions must match: compare only patterns with the same direction_id.
const byDir = (d: string) => patterns.filter((p) => p.route.endsWith(`|${d}`));
const derived = [...new Set([...deriveExpressLocal(byDir("0")), ...deriveExpressLocal(byDir("1"))])].sort();
const prev = (existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {}) as { add?: string[]; remove?: string[] };
const out = {
  source: "MTA static subway GTFS (gtfs_subway.zip): stop_times.txt patterns, stops.txt parent_station; scripts/build-transit-holds.ts",
  builtAt: new Date().toISOString().slice(0, 10),
  note: "Hold times are estimates; GTFS has no official hold flag. Realtime arrival/departure pairs always win.",
  derived,
  add: prev.add ?? [],
  remove: prev.remove ?? [],
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`express/local stations: ${derived.length}`);
