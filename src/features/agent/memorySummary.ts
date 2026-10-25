import { remembers } from "@/lib/memory/memory";
import { readHomeWork, readUsual, type HomeWork, type UsualTrip } from "./commute";

/**
 * The one line the agent may hear about this person (#370). Built only while
 * Daily rides or Home & Work is on, from names and a clock already stored on
 * the phone. No history, and no coordinates: a missing clock is left out
 * rather than invented.
 */
const MAX = 240;

/** "8:40 AM" from a stored New York hour and minute. */
export function clockLabel(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, "0");
  return `${h}:${m} ${hour < 12 ? "AM" : "PM"}`;
}

function rideLine(main: UsualTrip, other: UsualTrip | null): string {
  let line = `Usually takes the ${main.route}`;
  if (main.board) line += ` from ${main.board}`;
  if (main.alight) line += ` to ${main.alight}`;
  if (main.hour !== undefined && main.minute !== undefined) line += ` around ${clockLabel(main.hour, main.minute)}`;
  line += " on weekdays";
  if (other && other.route !== main.route) line += `, and the ${other.route} back`;
  return line.length > MAX ? `${line.slice(0, MAX - 1)}…` : line;
}

function placesLine(places: HomeWork): string | null {
  const { home, work } = places;
  const line = home && work ? `Home is ${home.label} and Work is ${work.label}` : home ? `Home is ${home.label}` : work ? `Work is ${work.label}` : null;
  return line && line.length > MAX ? `${line.slice(0, MAX - 1)}…` : line;
}

type Store = Pick<Storage, "getItem">;

/** Null when both switches are off, or when nothing has been saved yet. */
export function memorySummary(storage?: Store): string | null {
  const rides = remembers("rides");
  const homeWork = remembers("homeWork");
  if (!rides && !homeWork) return null;
  if (rides) {
    const work = readUsual("work", storage);
    const home = readUsual("home", storage);
    const main = work ?? home;
    if (main) return rideLine(main, work && home ? home : null);
  }
  return homeWork ? placesLine(readHomeWork(storage)) : null;
}
