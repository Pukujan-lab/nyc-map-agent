/**
 * The Events layer's time window ("Next 7 days", "Today", "This weekend"),
 * shared between the chip overlay (React) and the map layer chunk. All dates
 * are New York days, whatever the device's time zone.
 */
export type EventWindow = "week" | "today" | "weekend";

let current: EventWindow = "week";
const listeners = new Set<(w: EventWindow) => void>();

export const getWindow = (): EventWindow => current;
export function setWindow(w: EventWindow): void {
  if (w === current) return;
  current = w;
  listeners.forEach((l) => l(w));
}
export function subscribeWindow(l: (w: EventWindow) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const NY = "America/New_York";
const DAY = 86_400_000;

/** New York calendar date and weekday (0 = Sunday) of an instant. */
function nyDate(at: Date): { y: number; m: number; d: number; weekday: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/** The instant of New York midnight starting y-m-d. */
function nyMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d, 5); // 00:00 EST
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: NY, hourCycle: "h23", hour: "numeric" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  return new Date(guess - Number(p.hour) * 3_600_000); // 01:00 in EDT -> step back an hour
}

/** [from, to) for a window, starting no earlier than `now`. */
export function windowRange(w: EventWindow, now = new Date()): { from: Date; to: Date } {
  const t = nyDate(now);
  const today = nyMidnight(t.y, t.m, t.d);
  const dayAfter = (start: Date, n: number) => {
    const p = nyDate(new Date(start.getTime() + n * DAY + 12 * 3_600_000));
    return nyMidnight(p.y, p.m, p.d);
  };
  if (w === "today") return { from: now, to: dayAfter(today, 1) };
  if (w === "weekend") {
    // Saturday 00:00 to Monday 00:00; on the weekend itself, from now.
    const toSat = t.weekday === 0 ? -1 : 6 - t.weekday;
    const sat = dayAfter(today, toSat);
    const mon = dayAfter(sat, 2);
    return { from: now > sat ? now : sat, to: mon };
  }
  return { from: now, to: new Date(now.getTime() + 7 * DAY) };
}

/** Happening at `now` (start <= now < end). */
export const isHappeningNow = (start: string, end: string, now = Date.now()): boolean => Date.parse(start) <= now && now < Date.parse(end);

/** "Today · 3:00–6:30 PM", "Sat, Oct 24 · 1–6 PM", or a date range for multi-day events. */
export function formatWhen(start: string, end: string, now = new Date()): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = (d: Date) => {
    const a = nyDate(d);
    const n = nyDate(now);
    if (a.y === n.y && a.m === n.m && a.d === n.d) return "Today";
    return new Intl.DateTimeFormat("en-US", { timeZone: NY, weekday: "short", month: "short", day: "numeric" }).format(d);
  };
  const time = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" }).format(d).replace(":00", "");
  if (day(s) === day(new Date(e.getTime() - 1))) return `${day(s)} · ${time(s)}–${time(e)}`;
  return `${day(s)} – ${day(e)}`;
}
