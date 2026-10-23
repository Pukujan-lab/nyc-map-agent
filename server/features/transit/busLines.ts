/**
 * One page of bus routes at a time. The catalog is static; the live feed is
 * filtered down to the page (or the shuttle / trip) the map asked for.
 */
import { BUS_GROUPS, type BusGroup, type BusPage } from "./busCatalog";

export const BUS_PAGE_CAP = 20;
const BUS_ROUTE_RE = /^[A-Z]{1,3}\d{1,3}[A-Z+]{0,2}$/;

function byRoute(a: string, b: string): number {
  const pa = /^([A-Z]+)(\d+)(.*)$/.exec(a);
  const pb = /^([A-Z]+)(\d+)(.*)$/.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
  const na = Number(pa[2]), nb = Number(pb[2]);
  if (na !== nb) return na - nb;
  return pa[3].localeCompare(pb[3]);
}

/** Split an already-sorted route list into pages of at most `size`. */
export function pagesOf(ids: string[], groupId: string, size = BUS_PAGE_CAP): BusPage[] {
  const sorted = [...ids].sort(byRoute);
  const out: BusPage[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const routes = sorted.slice(i, i + size);
    const n = out.length + 1;
    out.push({ id: `${groupId}-${n}`, label: routes.length === 1 ? routes[0] : `${routes[0]}–${routes[routes.length - 1]}`, routes });
  }
  return out;
}

export function busCatalog(): { groups: BusGroup[] } {
  return { groups: BUS_GROUPS };
}

/** Comma-separated route query. Null when the caller wants the whole feed; "bad" when the list is empty, too long, or not route ids. */
export function parseBusRoutes(raw: string | null): string[] | "bad" | null {
  if (!raw) return null;
  const parts = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!parts.length || parts.length > BUS_PAGE_CAP || parts.some((p) => !BUS_ROUTE_RE.test(p))) return "bad";
  return parts;
}

export function filterBuses<T extends { route: string }>(buses: T[], routes: string[]): T[] {
  const allow = new Set(routes.map((r) => r.toUpperCase()));
  return buses.filter((b) => allow.has(b.route.toUpperCase()));
}
