import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { findNearestImage, hasMapillaryToken, mapillaryImageLink } from "@/lib/api/mapillary";

/** A street photo farther than this shows another spot, not the restroom. */
const PHOTO_NEAR_M = 40;

/** Google Maps at this spot, so someone can check its photos and reviews there. */
export function googleMapsLink(lon: number, lat: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * A tapped restroom's look from the street: the nearest Mapillary photo within
 * 40 m, when there is one, then a link to the spot on Google Maps.
 * Loads only when the card opens, so the map itself stays photo-free.
 */
export function RestroomPhoto({ lon, lat, name }: { lon: number; lat: number; name: string }) {
  const photo = useQuery({
    queryKey: ["restroom-photo", lon.toFixed(5), lat.toFixed(5)],
    queryFn: () => findNearestImage({ lon, lat }, PHOTO_NEAR_M),
    enabled: hasMapillaryToken,
    staleTime: Infinity,
    retry: false,
  });
  const img = photo.data?.thumbnailUrl ? photo.data : null;
  return (
    <div className="mt-2 space-y-1" data-testid="restroom-photo">
      {img ? (
        <figure className="space-y-1">
          <img src={img.thumbnailUrl ?? ""} alt={`Street near ${name}`} loading="lazy" className="max-h-40 w-full rounded-lg object-cover" />
          <figcaption className="text-[11px] text-muted-foreground">
            <a href={mapillaryImageLink(img.id)} target="_blank" rel="noreferrer" className="underline underline-offset-2">Street photo</a>
            {` ${Math.round(img.distance)} m away`}{img.capturedAt ? ` · ${img.capturedAt}` : ""} · Mapillary
          </figcaption>
        </figure>
      ) : null}
      <a href={googleMapsLink(lon, lat)} target="_blank" rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1 text-xs text-foreground underline underline-offset-2">
        <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open in Google Maps
      </a>
    </div>
  );
}
