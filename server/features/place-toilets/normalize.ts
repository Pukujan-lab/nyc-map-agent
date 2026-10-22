import type { OverpassElement, StoredPlaceToilet, ToiletAccess } from "./schema";

const AMENITIES = new Set(["restaurant", "cafe", "fast_food", "bar", "pub"]);
const ANYONE = new Set(["yes", "permissive", "public"]);
const CUSTOMERS = new Set(["customers"]);

const yesNo = (v: string | undefined): boolean | null => (v === "yes" || v === "designated" ? true : v === "no" ? false : null);

/**
 * One Overpass element → a stored place, or null when it has no usable toilet:
 * not toilets=yes, a private/no toilets:access, no name or no position.
 */
export function fromOsm(e: OverpassElement): StoredPlaceToilet | null {
  const t = e.tags;
  if (t.toilets !== "yes") return null;
  const kind = t.amenity && AMENITIES.has(t.amenity) ? t.amenity : t.shop ? "shop" : null;
  if (!kind) return null;
  const raw = t["toilets:access"];
  let access: ToiletAccess;
  if (raw === undefined) access = "customers";
  else if (ANYONE.has(raw)) access = "anyone";
  else if (CUSTOMERS.has(raw)) access = "customers";
  else return null;
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const name = t.name ?? t.brand;
  if (lat === undefined || lon === undefined || !name) return null;
  const fee = yesNo(t["toilets:fee"] ?? t.fee);
  return {
    id: `osm:${e.type}/${e.id}`,
    name,
    kind,
    access,
    accessTagged: raw !== undefined,
    wheelchair: yesNo(t["toilets:wheelchair"]),
    changingTable: yesNo(t["toilets:changing_table"] ?? t.changing_table),
    fee,
    source: "openstreetmap",
    url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    lon,
    lat,
  };
}
