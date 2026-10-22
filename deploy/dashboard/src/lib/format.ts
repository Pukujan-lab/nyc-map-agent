import { format, formatDistanceStrict } from "date-fns";

/** First 7 characters of a commit sha. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** `42s`, `3m 12s`, `—` for an unknown duration. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/** "4 minutes ago", "in 3 seconds" — rendered in the viewer's locale. */
export function formatRelative(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  const date = parse(iso);
  if (!date) return "—";
  if (Math.abs(now - date.getTime()) < 5000) return "just now";
  return formatDistanceStrict(date, new Date(now), { addSuffix: true });
}

/** "2026-10-21 15:45:00 UTC+2" — local timezone, second precision. */
export function formatAbsolute(iso: string | null | undefined): string {
  const date = parse(iso);
  if (!date) return "—";
  return `${format(date, "yyyy-MM-dd HH:mm:ss")} ${timeZoneLabel(date)}`;
}

/** "15:45:00" — clock time for log prefixes. */
export function formatClock(iso: string | null | undefined): string {
  const date = parse(iso);
  if (!date) return "--:--:--";
  return format(date, "HH:mm:ss");
}

/** Elapsed milliseconds between two ISO timestamps (end defaults to now). */
export function elapsedMs(
  startIso: string | null | undefined,
  endIso?: string | null,
  now: number = Date.now(),
): number | null {
  const start = parse(startIso);
  if (!start) return null;
  const end = endIso ? parse(endIso) : null;
  return Math.max(0, (end ?? new Date(now)).getTime() - start.getTime());
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeZoneLabel(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
