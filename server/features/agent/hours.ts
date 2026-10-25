/**
 * Is a place open at a given moment, from the free-text hours in the city's
 * restroom list? The list mixes "8am-4pm, Open later seasonally", per-day
 * lines ("Monday: 10:00 am - 6:00 pm", "Sunday\tCLOSED"), "24 Hours" and
 * "Temp Closed". Anything else (dusk, by permit, prose) is unknown: null.
 */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon|midnight)?`;
const RANGE = new RegExp(`${TIME}\\s*(?:-|–|to)\\s*${TIME}`, "i");

/** Minutes after midnight, or null. "12am" is 0, "12pm" and "noon" are 720. */
function minutes(h: string, m: string | undefined, ap: string | undefined): number | null {
  let hour = Number(h);
  const mins = Number(m ?? 0);
  if (hour > 24 || mins > 59) return null;
  const a = ap?.toLowerCase();
  if (a === "noon") return 12 * 60;
  if (a === "midnight") return 0;
  if (a === "pm" && hour < 12) hour += 12;
  if (a === "am" && hour === 12) hour = 0;
  return hour * 60 + mins;
}

/** Whether `t` (minutes after midnight) falls in the first time range of `text`; null when it has none. */
function inRange(text: string, t: number): boolean | null {
  const r = RANGE.exec(text.replace(/a\.m\./gi, "am").replace(/p\.m\./gi, "pm"));
  if (!r) return null;
  // "10-6pm": the opening time borrows the closing am/pm only when that keeps it before closing.
  const close = minutes(r[4], r[5], r[6]);
  let open = minutes(r[1], r[2], r[3] ?? r[6]);
  if (open === null || close === null) return null;
  if (!r[3] && r[6] && open >= close) open = minutes(r[1], r[2], "am");
  if (open === null) return null;
  return open <= close ? t >= open && t < close : t >= open || t < close; // past midnight: "6am-1am"
}

/** The weekday (0 = Sunday) and minutes after midnight in New York. */
export function nyClock(now: Date): { day: number; t: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  return { day: DAYS.indexOf(parts.weekday.toLowerCase()), t: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function openAt(hours: string | null | undefined, now: Date): boolean | null {
  if (!hours) return null;
  const text = hours.trim();
  if (/^24\s*hours/i.test(text)) return true;
  if (/^temp(orarily)?\s*closed/i.test(text)) return false;
  const { day, t } = nyClock(now);
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const perDay = lines.filter((l) => DAYS.some((d) => l.toLowerCase().startsWith(d)));
  if (perDay.length) {
    const today = perDay.find((l) => l.toLowerCase().startsWith(DAYS[day]));
    if (!today) return null;
    if (/closed/i.test(today)) return false;
    return inRange(today, t);
  }
  return inRange(text, t);
}
