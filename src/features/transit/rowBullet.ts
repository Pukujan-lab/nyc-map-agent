import { STATION_ROW_PREFIX } from "@/lib/transit/bullets";

/**
 * Which bullet in a station's route row (B D N Q R W under the name) a tap landed on. The row is one map
 * image, so the map alone can't tell; this redoes its layout (lib/transit/bullets drawRow: 16 px per
 * bullet, 2 px edge, 18 px tall at icon-size 1, hung `offsetY` px below the station). Pure, for tests.
 */
export function rowBulletAt(row: string, station: { x: number; y: number }, tap: { x: number; y: number }, size: number, offsetY = 6): string | null {
  if (!row.startsWith(STATION_ROW_PREFIX)) return null;
  const routes = row.slice(STATION_ROW_PREFIX.length).split(",").filter(Boolean);
  if (!routes.length) return null;
  const width = (routes.length * 16 + 2) * size;
  const left = station.x - width / 2;
  const top = station.y + offsetY * size;
  // A little slack around the row: fingers are bigger than bullets.
  if (tap.y < top - 4 || tap.y > top + 18 * size + 4 || tap.x < left - 4 || tap.x > left + width + 4) return null;
  const i = Math.floor((tap.x - left - 1 * size) / (16 * size));
  return routes[Math.min(routes.length - 1, Math.max(0, i))];
}
