import { busPrefix } from "./bullets";

/** Local groups by borough prefix, then express. The order people scan them in the route picker. */
export const BUS_GROUPS = ["M", "Bx", "B", "Q", "S"] as const;
export const EXPRESS_GROUPS = ["QM", "BM", "BxM", "X", "SIM"] as const;

const num = (r: string) => Number(/\d+/.exec(r)?.[0] ?? Infinity);

/** Route ids grouped by prefix (M, Bx, … SIM), each in number order: Q1, Q2 … Q113. Empty groups are left out. */
export function groupBusRoutes(routes: readonly string[]): Map<string, string[]> {
  const byGroup = new Map<string, string[]>();
  for (const g of [...BUS_GROUPS, ...EXPRESS_GROUPS]) byGroup.set(g, []);
  for (const r of new Set(routes.map((x) => x.toUpperCase()))) byGroup.get(busPrefix(r).text)?.push(r);
  for (const [g, list] of byGroup) {
    if (!list.length) byGroup.delete(g);
    else list.sort((a, b) => num(a) - num(b) || a.localeCompare(b));
  }
  return byGroup;
}
