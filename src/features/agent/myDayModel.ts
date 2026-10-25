import { delayOn, type CommuteTo, type LineAlert, type UsualTrip } from "./commute";

/**
 * Rows in the My day dropdown (frame 13). Built only from the usual trips and
 * the alerts feed. A delay opens the commute notice; any other notice opens
 * the line panel. No food, shops, or advice about when to leave.
 */
export interface DayNotice {
  id: string;
  route: string;
  color?: string;
  label: string;
  /** Amber extra, such as "+6 min", only when the alert names minutes. */
  detail?: string;
  open: "commute" | "line";
  elevator: boolean;
}

export interface RideChip {
  id: string;
  to: CommuteTo;
  route: string;
  color?: string;
  label: string;
  /** Set for an alternative line, so the planner is asked to take it. */
  via?: string;
}

const clip = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plain = (s: string) => s.replace(/\[([A-Z0-9]+)\]/g, "$1").split("\n")[0].trim();

function delayLabel(alert: LineAlert, minutes: number | null): { label: string; detail?: string } {
  const period = alert.period.trim();
  const tonight = /tonight|this evening/i.test(`${period} ${alert.text}`);
  const label = tonight ? "Tonight" : period && period.length <= 18 ? period : "Delayed";
  return minutes ? { label, detail: `+${minutes} min` } : { label };
}

/** Notices on the usual lines, one row per alert, delays first on each line. */
export function todayNotices(alerts: LineAlert[], lines: Array<{ route: string; color?: string; board?: string }>): DayNotice[] {
  const out: DayNotice[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const delay = delayOn(alerts, line.route);
    const delayAlert = alerts.find((a) => a.kind === "delay" && a.routes.includes(line.route));
    if (delay && delayAlert && !seen.has(delayAlert.id)) {
      seen.add(delayAlert.id);
      const t = delayLabel(delayAlert, delay.minutes);
      out.push({ id: delayAlert.id, route: line.route, color: line.color, label: t.label, detail: t.detail, open: "commute", elevator: false });
    }
    for (const a of alerts) {
      if (seen.has(a.id) || !a.routes.includes(line.route) || a.kind === "delay") continue;
      seen.add(a.id);
      const text = plain(a.text);
      const elevator = /elevator|escalator/i.test(`${a.text} ${a.kind}`);
      if (elevator) {
        const named = text.match(/\b(?:at|near)\s+([A-Z0-9][\w .'-]{1,28})/)?.[1]?.replace(/[.,]$/, "").trim();
        const station = named || line.board?.split("-")[0]?.trim();
        out.push({ id: a.id, route: line.route, color: line.color, label: clip(station ? `${station} elevator out` : "Elevator out"), open: "line", elevator: true });
        continue;
      }
      if (a.skipNames.length) {
        const n = a.skipNames.length;
        out.push({ id: a.id, route: line.route, color: line.color, label: clip(`${line.route} skips ${n}`), open: "line", elevator: false });
        continue;
      }
      if (text) out.push({ id: a.id, route: line.route, color: line.color, label: clip(text), open: "line", elevator: false });
    }
  }
  return out.slice(0, 6);
}

/** Line-bullet chips for the usual trips: the main ride, then each alternative. */
export function rideChips(usual: Array<[CommuteTo, UsualTrip]>): RideChip[] {
  const chips: RideChip[] = [];
  for (const [to, trip] of usual) {
    const dest = to === "work" ? "Work" : "Home";
    chips.push({ id: `${to}:${trip.route}`, to, route: trip.route, color: trip.color, label: dest });
    for (const alt of trip.alternatives) {
      if (chips.some((c) => c.route === alt.route && c.to === to)) continue;
      chips.push({ id: `${to}:${alt.route}`, to, route: alt.route, color: alt.color, label: alt.route, via: alt.route });
    }
  }
  return chips;
}

/** "Sat 11 AM · Home to Work", from the time it was looked up. No coordinates. */
export function lookedUpWhen(t: number, from: string, to: string): string {
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(t);
  return `${when} · ${from} to ${to}`;
}
