import type { Trip } from "./schema";

/**
 * "Remind me" for a trip planned ahead (#418 scene 3): a calendar event at the
 * trip's own leave time with an alert 10 minutes before. The phone's calendar
 * keeps it, so it fires with the app closed and nothing is stored or sent.
 * The person taps it; the app never sets one on its own.
 */
export const REMIND_BEFORE_MIN = 10;

const TZID = "America/New_York";
// Eastern time rules since 2007, so calendars read TZID without guessing.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", `TZID:${TZID}`,
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:20070311T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:20071104T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

/** "2026-10-26T17:50" (New York local) → "20261026T175000". */
const icsLocal = (local: string) => `${local.slice(0, 16).replace(/[-:]/g, "")}00`;
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const w = new TextEncoder().encode(ch).length;
    if (n + w > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += w;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** The trip in the order you do it: "Take the 4 from 14 St-Union Sq to Grand Central-42 St". */
export function tripSteps(trip: Trip): string[] {
  return trip.legs.map((l) => l.kind === "ride" ? `Take the ${l.route}${l.fromStop ? ` from ${l.fromStop}` : ""}${l.toStop ? ` to ${l.toStop}` : ""}` : l.label);
}

export function tripIcs(trip: Trip, now: Date = new Date()): string {
  const title = `Leave for ${trip.destination.label}`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NYC Map Agent//Trip reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:trip-${trip.id}@nyc.design-bakery.com`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART;TZID=${TZID}:${icsLocal(trip.departIso)}`,
    `DTEND;TZID=${TZID}:${icsLocal(trip.arriveIso)}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(trip.origin.label)}`,
    `DESCRIPTION:${esc([...tripSteps(trip), ...trip.alerts.slice(0, 2)].join("\n"))}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${REMIND_BEFORE_MIN}M`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** "17:40": when the calendar will alert, in New York time. */
export function remindAt(trip: Trip): string {
  const [h, m] = trip.departIso.slice(11, 16).split(":").map(Number);
  const t = (h * 60 + m - REMIND_BEFORE_MIN + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Hands the event to the phone: iOS and Android offer "Add to Calendar" for a .ics file. */
export function saveReminder(trip: Trip): void {
  const url = URL.createObjectURL(new Blob([tripIcs(trip)], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "trip-reminder.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
