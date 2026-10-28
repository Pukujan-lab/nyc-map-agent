/**
 * "tomorrow at 9am", "Friday 6:30 pm", "now" → a New York local time
 * ("2026-10-25T09:00"). Parsed here, on the server, so the trip tools never
 * depend on the model doing calendar arithmetic. Pure: `now` is passed in.
 */
import { nyLocalToDate, toNyLocal } from "./trip";

const LOCAL = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Calendar day arithmetic on a local date, safe across DST (no clock maths). */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");

/** The clock time in the words, as [hour, minute], or null when none is named. */
function clockOf(s: string): [number, number] | null {
  if (/\bnoon\b|\bmidday\b/.test(s)) return [12, 0];
  if (/\bmidnight\b/.test(s)) return [0, 0];
  for (const m of s.matchAll(/(?<![\d-])(\d{1,2})(?::(\d\d))?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$|[,!?])/g)) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m[3]?.[0];
    // A bare number is a clock time only with minutes or am/pm ("9am", "9:30"), not "in 3 stops".
    if (!ap && !m[2]) continue;
    if (h > 23 || min > 59 || (ap && (h < 1 || h > 12))) continue;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    // "8:30 tonight" with no am/pm.
    if (!ap && h < 12 && /\b(evening|tonight|night|afternoon)\b/.test(s)) h += 12;
    return [h, min];
  }
  return null;
}

/**
 * Resolve the user's words to New York local "YYYY-MM-DDTHH:MM", or null when
 * they name no time we can read. An exact local or ISO time passes through.
 */
export function parseWhen(text: string, now: Date): string | null {
  const raw = text.trim();
  if (LOCAL.test(raw)) return toNyLocal(nyLocalToDate(raw.slice(0, 16)));
  const s = raw.toLowerCase();
  const nowLocal = toNyLocal(now);
  const today = nowLocal.slice(0, 10);
  if (!s || /^(now|right now|asap|leave now|today|soon)$/.test(s)) return nowLocal;
  const inMins = /\bin\s+(\d{1,3})\s*(min|minute|minutes|hour|hours|hr|hrs)\b/.exec(s);
  if (inMins) return toNyLocal(new Date(now.getTime() + Number(inMins[1]) * (/^h/.test(inMins[2]) ? 3600_000 : 60_000)));

  let clock = clockOf(s);
  if (!clock && /\bmorning\b/.test(s)) clock = [9, 0];
  if (!clock && /\bafternoon\b/.test(s)) clock = [15, 0];
  if (!clock && /\b(evening|tonight)\b/.test(s)) clock = [19, 0];
  // "this weekend", "on the weekend": Saturday (today when it is the weekend already), mid-morning unless a time is named.
  const weekend = /\bweek-?end\b/.test(s) && !/\bweekdays?\b/.test(s);
  const inWeekend = weekday(today) === 6 || weekday(today) === 0;
  if (!clock && weekend && !inWeekend) clock = [10, 0];
  const hm = clock ? `${pad(clock[0])}:${pad(clock[1])}` : nowLocal.slice(11, 16);
  /** Today if that time is still ahead, else the same time tomorrow. */
  const nextAt = (d: string) => (`${d}T${hm}` < nowLocal ? addDays(d, 1) : d);

  let day: string | null = null;
  const date = /\b\d{4}-\d\d-\d\d\b/.exec(s);
  const wd = DAYS.findIndex((d) => new RegExp(`\\b${d.slice(0, 3)}(${d.slice(3)})?\\b`).test(s));
  if (date) day = date[0];
  else if (/\bday after tomorrow\b/.test(s)) day = addDays(today, 2);
  else if (/\b(tomorrow|tmrw|tmr)\b/.test(s)) day = addDays(today, 1);
  else if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(s)) day = today;
  else if (weekend) {
    day = inWeekend ? today : addDays(today, 6 - weekday(today));
    if (/\bnext\b/.test(s)) day = addDays(day, 7);
  }
  else if (wd >= 0) {
    const ahead = (wd - weekday(today) + 7) % 7;
    // "Friday" on a Friday is today while that time is ahead; "next Friday" is always a week on.
    if (ahead === 0) day = /\bnext\b/.test(s) || `${today}T${hm}` < nowLocal ? addDays(today, 7) : today;
    else day = addDays(today, ahead);
  }
  if (!day && !clock) return null;
  // A time alone means the next one: "9am" asked at 10pm is tomorrow morning.
  return toNyLocal(nyLocalToDate(`${day ?? nextAt(today)}T${hm}`));
}

/** A trip this far ahead is planned from schedules; live delays are not known yet. */
export const LIVE_WINDOW_MS = 60 * 60_000;
export function isFuture(local: string, now: Date): boolean {
  return nyLocalToDate(local).getTime() - now.getTime() > LIVE_WINDOW_MS;
}

/** "Sat, Oct 25, 9:00 AM" for a New York local time. */
export function sayWhen(local: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(nyLocalToDate(local));
}

/**
 * What is known for a trip planned ahead. Only a future trip gets one: within
 * the hour the planner's live estimates and alerts apply as they are.
 */
export function scheduleFor(departLocal: string, now: Date): { future: boolean; note: string } | undefined {
  if (!isFuture(departLocal, now)) return undefined;
  return {
    future: true,
    note: `Planned for ${sayWhen(departLocal)} from timetables. Planned work and the forecast are for that time; live delays are not known this far ahead.`,
  };
}
