import { lineOf } from "@/lib/transit/selectedLine";

/**
 * What a tap on the subway map offers (owner, 2026-10-26). Where several lines meet (Myrtle Av on the J, M
 * and Z) the tap used to open whichever line was drawn on top. Now one line opens straight away, and more
 * than one get a chooser: each line, plus the station when the tap is on one. Pure.
 */
export interface LineChoice { routes: string[]; station?: { id: string; name: string } }

export function lineChoice(hitRoutes: readonly string[], station?: { id: string; name: string; routes: string }): LineChoice | string | null {
  const routes: string[] = [];
  const add = (r: string) => { const l = lineOf(r); if (l && !routes.includes(l)) routes.push(l); };
  // The station's own lines first, in the order its sign lists them, then any other line drawn under the tap.
  for (const r of String(station?.routes ?? "").split(/[\s,]+/)) if (r) add(r);
  for (const r of hitRoutes) add(r);
  if (!routes.length) return null;
  if (routes.length === 1) return routes[0];
  return { routes, ...(station ? { station: { id: station.id, name: station.name } } : {}) };
}
