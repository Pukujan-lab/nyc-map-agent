import { metres, type ExitPlace, type Pt } from "@/features/underground/exits";

/** What the walker sees around them: the street underfoot and a couple of things to look for. */
export interface WalkPlace {
  street: string | null;
  near: string[];
}

/**
 * Pick what to show while walking from the map's read of a spot: the street
 * you are on, then up to two storefronts within a short block, nearest first.
 * With no storefront close by, the nearest tall landmark you can see from afar.
 * `skip` leaves out the place you are walking to: "near Aldi" at Aldi says nothing.
 */
export function walkPlace(place: ExitPlace, at: Pt, skip = ""): WalkPlace {
  const same = (name: string) => Boolean(skip) && name.toLowerCase() === skip.toLowerCase();
  const byDistance = place.landmarks
    .filter((l) => !same(l.name))
    .map((l) => ({ ...l, d: metres(l.at, at) }))
    .sort((a, b) => a.d - b.d);
  const shops = [...new Set(byDistance.filter((l) => !l.tall).map((l) => l.name))].slice(0, 2);
  const tall = byDistance.find((l) => l.tall && l.d <= 400);
  return { street: place.streets?.[0] ?? null, near: shops.length ? shops : tall ? [tall.name] : [] };
}

/** "On Queens Blvd · near Aldi, Chase", or null when the map knows nothing here. */
export function walkLine(w: WalkPlace | null): string | null {
  if (!w) return null;
  const parts = [w.street ? `On ${w.street}` : null, w.near.length ? `near ${w.near.join(", ")}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
