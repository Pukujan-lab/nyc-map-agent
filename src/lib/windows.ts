/** Local calendar date as yyyy-MM-dd (date-fns' format was ~3 kB for this one pattern). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type WindowId = "90d" | "12mo";

export const WINDOW_IDS: WindowId[] = ["90d", "12mo"];

export interface WindowBounds {
  id: WindowId;
  /** Zone-less NYC-local timestamp, e.g. `2026-07-21T00:00:00`. */
  startIso: string;
  /** Zone-less NYC-local timestamp. */
  endIso: string;
  /** Human label, e.g. "last 90 days". */
  label: string;
  /** Short label for chips, e.g. "90 days". */
  shortLabel: string;
  /** Inclusive start date for display. */
  startDate: string;
  endDate: string;
}

/**
 * Timestamps in this data are NYC-local with no zone suffix, so window math is
 * done on plain dates and never converted through UTC.
 */
export function windowBounds(id: WindowId, now: Date = new Date()): WindowBounds {
  const start = new Date(now);
  if (id === "90d") start.setDate(start.getDate() - 90);
  else {
    start.setFullYear(start.getFullYear() - 1);
    if (start.getMonth() !== now.getMonth()) start.setDate(0); // Feb 29 -> Feb 28, like date-fns subMonths
  }
  const startDate = ymd(start);
  const endDate = ymd(now);
  return {
    id,
    startIso: `${startDate}T00:00:00`,
    endIso: `${endDate}T23:59:59`,
    label: id === "90d" ? "the last 90 days" : "the last 12 months",
    shortLabel: id === "90d" ? "90 days" : "12 months",
    startDate,
    endDate,
  };
}

export function parseWindowId(value: string | null): WindowId {
  return value === "12mo" ? "12mo" : "90d";
}
