import { THEMES, type ThemeId } from "@/lib/theme";

/**
 * Our own station names (Layers & filters > Transit > Station names): bold
 * ink with a halo in the theme's land colour, beside the station dot, with a
 * strip of route bullets underneath. Platforms of one complex that share a
 * name (Atlantic Av-Barclays Ctr has three) become one label with every route.
 */
const STATION_BULLETS_PREFIX = "stnbullets|";
/** A complex with this many routes, or several platforms, shows from z14; the rest from z15. */
const MAJOR_ROUTES = 4;
export const MAJOR_MINZOOM = 14;
export const ALL_MINZOOM = 15;
const MERGE_METRES = 300;

type StationProps = { id: string; name: string; routes: string };
type StationLabelProps = { name: string; routes: string; major: boolean; bullets: string };

const metres = (a: number[], b: number[]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540);
};
/** Route order for the bullet strip: numbers, then letters, as on MTA signs. */
const order = (a: string, b: string) => (/^\d/.test(a) === /^\d/.test(b) ? a.localeCompare(b) : /^\d/.test(a) ? -1 : 1);

/** One label point per station complex. Pure, for tests. */
export function stationLabels(
  features: ReadonlyArray<GeoJSON.Feature<GeoJSON.Point, StationProps>>,
  colors: Record<string, string> = {},
): GeoJSON.FeatureCollection<GeoJSON.Point, StationLabelProps> {
  const groups: Array<{ name: string; pts: number[][]; routes: Set<string> }> = [];
  for (const f of features) {
    const p = f.geometry.coordinates;
    const g = groups.find((x) => x.name === f.properties.name && x.pts.some((q) => metres(q, p) < MERGE_METRES));
    const routes = String(f.properties.routes ?? "").split(/\s+/).filter(Boolean);
    if (g) { g.pts.push(p); routes.forEach((r) => g.routes.add(r)); }
    else groups.push({ name: f.properties.name, pts: [p], routes: new Set(routes) });
  }
  return {
    type: "FeatureCollection",
    features: groups.map((g) => {
      const routes = [...g.routes].sort(order);
      const lon = g.pts.reduce((s, p) => s + p[0], 0) / g.pts.length;
      const lat = g.pts.reduce((s, p) => s + p[1], 0) / g.pts.length;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          name: g.name,
          routes: routes.join(" "),
          major: routes.length >= MAJOR_ROUTES || g.pts.length > 1,
          bullets: routes.length ? stationBulletsId(routes, colors) : "",
        },
      };
    }),
  };
}

export function stationBulletsId(routes: readonly string[], colors: Record<string, string>): string {
  return `${STATION_BULLETS_PREFIX}${routes.map((r) => `${r}:${(colors[r] ?? "#808183").replace("#", "")}`).join(",")}`;
}

/** Ink and halo for a theme: dark ink on a land-coloured halo, or light ink at night. */
export function stationLabelColors(id: ThemeId): { ink: string; halo: string } {
  const t = THEMES[id];
  return t.dark ? { ink: "#F7F6F2", halo: t.land } : { ink: "#141414", halo: t.land };
}

