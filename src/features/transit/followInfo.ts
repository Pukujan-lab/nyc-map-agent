import type { TransitAlert } from "./hooks";

/** Delays and notices for one route. A detour that is not planned work counts as a delay. */
export function classifyRouteAlerts(alerts: TransitAlert[], route: string): { delays: TransitAlert[]; notices: TransitAlert[] } {
  const mine = alerts.filter((a) => a.routes.includes(route));
  return {
    delays: mine.filter((a) => a.kind === "delay" || (a.reroute && a.kind !== "planned" && a.kind !== "notice")),
    notices: mine.filter((a) => a.kind === "notice" || a.kind === "planned"),
  };
}

const when = (t: number) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Active period from the alert, or null when the feed gives no time. */
export function alertTimeLabel(a: { period?: string; start?: number; end?: number } | undefined): string | null {
  if (!a) return null;
  if (a.period?.trim()) return a.period.trim();
  if (a.start && a.end) return `${when(a.start)} – ${when(a.end)}`;
  if (a.start) return `${when(a.start)} until further notice`;
  return null;
}

/** Station names a skip change names for this route. */
export function skipNamesFor(a: TransitAlert | undefined, route: string): string[] {
  if (!a) return [];
  const named = (a.changes ?? []).filter((c) => c.kind === "skip" && c.route === route).flatMap((c) => c.names);
  const names = named.length ? named : (a.skipNames ?? []);
  return [...new Set(names)];
}

/** Alert text without the "[F]" brackets. */
export const plainAlert = (s: string) => s.replace(/\[([A-Z0-9]+)\]/g, "$1");
