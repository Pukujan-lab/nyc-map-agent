import type { Palette } from "@/lib/theme";

/**
 * Station names (Layers & filters > Transit lines > Station names, #186): one
 * label per station complex, bold ink with a halo in the theme's land colour,
 * beside the dot with the route bullets underneath. Platforms sharing a name
 * within 300 m (Atlantic Av-Barclays Ctr has three) label once with every
 * route; complexes with 4+ routes or several platforms are "major".
 */
export const MAJOR_MINZOOM = 14;
export const ALL_MINZOOM = 15;
const MAJOR_ROUTES = 4;
const MERGE_METRES = 300;

type Station = { geometry: { coordinates: number[] }; properties: { id: string; name: string; routes?: string } };
export type ComplexInfo = { major: boolean; dup: boolean; routes: string[] };

const metres = (a: number[], b: number[]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540);
};
/** Numbers first, then letters, as on MTA signs. */
const order = (a: string, b: string) => (/^\d/.test(a) === /^\d/.test(b) ? a.localeCompare(b) : /^\d/.test(a) ? -1 : 1);
const routesOf = (s: Station) => String(s.properties.routes ?? "").split(/[\s,]+/).filter((r) => r && !r.endsWith("X"));

/** Per station id: is it major, is it a duplicate platform of a complex, and the complex's routes. Pure, for tests. */
export function stationComplexes(stations: readonly Station[]): Map<string, ComplexInfo> {
  const groups: Station[][] = [];
  for (const s of stations) {
    const g = groups.find((x) => x[0].properties.name === s.properties.name && x.some((o) => metres(o.geometry.coordinates, s.geometry.coordinates) < MERGE_METRES));
    if (g) g.push(s); else groups.push([s]);
  }
  const out = new Map<string, ComplexInfo>();
  for (const g of groups) {
    const routes = [...new Set(g.flatMap(routesOf))].sort(order);
    const major = routes.length >= MAJOR_ROUTES || g.length > 1;
    g.forEach((s, i) => out.set(String(s.properties.id), { major, dup: i > 0, routes }));
  }
  return out;
}

/** Ink and halo for any palette (fixed themes and Auto's day / dusk / night). */
export function stationLabelInk(p: Pick<Palette, "dark" | "land">): { ink: string; halo: string } {
  return { ink: p.dark ? "#F7F6F2" : "#141414", halo: p.land };
}
