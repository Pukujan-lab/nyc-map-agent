/**
 * Ground-floor facade categories for storefronts. The order is the cell order
 * of public/textures/storefront-atlas.png (5 x 2, scripts/make-storefront-atlas.py).
 */
export const FACADE_CATEGORIES = ["restaurant", "cafe", "deli", "pharmacy", "bank", "clothing", "supermarket", "mall", "bar", "generic"] as const;
export type FacadeCategory = (typeof FACADE_CATEGORIES)[number];

// Compact: category ← space-separated OSM shop / amenity values.
const GROUPS: Array<[FacadeCategory, string]> = [
  ["restaurant", "restaurant fast_food"],
  ["cafe", "cafe bakery coffee ice_cream"],
  ["deli", "convenience deli greengrocer butcher alcohol kiosk"],
  ["pharmacy", "pharmacy chemist optician clinic dentist"],
  ["bank", "bank bureau_de_change"],
  ["clothing", "clothes shoes boutique jewelry gift cosmetics beauty"],
  ["supermarket", "supermarket variety_store"],
  ["mall", "mall department_store"],
  ["bar", "bar pub nightclub wine"],
];
const BY_KIND = new Map(GROUPS.flatMap(([c, ks]) => ks.split(" ").map((k) => [k, c] as const)));

/** OSM shop / amenity value (the sign's `kind`) plus its coarse `cat` → facade category. Pure. */
export function facadeCategory(kind: string | undefined, cat?: string): FacadeCategory {
  const k = (kind ?? "").toLowerCase();
  const hit = BY_KIND.get(k);
  if (hit) return hit;
  if (cat === "mall") return "mall";
  if (cat === "money") return "bank";
  if (cat === "health") return "pharmacy";
  if (cat === "food") return "restaurant";
  return "generic";
}

/** Atlas cell (column, row) of a category. Pure. */
export function atlasCell(c: FacadeCategory): [number, number] {
  const i = FACADE_CATEGORIES.indexOf(c);
  return [i % 5, Math.floor(i / 5)];
}

