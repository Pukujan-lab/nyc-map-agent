/** Planned-work time windows in New York time, shared by the line panel and the agent (no React here). */
export interface LineDay { from: number; to: number; label: string }

const TZ = "America/New_York";
/** New York wall-clock parts of an instant. */
function nyParts(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
/** Epoch seconds of a New York wall-clock time (DST-correct: the offset is read at that instant). */
export function nyEpoch(y: number, m: number, d: number, h: number): number {
  const guess = Date.UTC(y, m - 1, d, h);
  const off = nyParts(guess);
  const shown = Date.UTC(off.y, off.m - 1, off.d, off.h);
  return Math.round((guess + (guess - shown)) / 1000);
}

/**
 * The weekend as the MTA schedules work: Friday 9 pm to Monday 5 am, New York time. On a weekend
 * (or Friday night) it is the one under way; otherwise the coming one.
 */
export function weekendWindow(nowMs = Date.now()): LineDay {
  const n = nyParts(nowMs);
  const back = n.wd === 6 ? 1 : n.wd === 0 ? 2 : n.wd === 1 && n.h < 5 ? 3 : n.wd - 5;
  const fri = new Date(Date.UTC(n.y, n.m - 1, n.d - back));
  const from = nyEpoch(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate(), 21);
  const mon = new Date(Date.UTC(n.y, n.m - 1, n.d - back + 3));
  return { from, to: nyEpoch(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate(), 5), label: "This weekend" };
}

/** The whole New York day of an instant, into the small hours after (overnight work belongs to it). */
export function dayWindow(ms: number): LineDay {
  const n = nyParts(ms);
  const from = nyEpoch(n.y, n.m, n.d, 0);
  const label = new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  return { from, to: from + 29 * 3600, label };
}
