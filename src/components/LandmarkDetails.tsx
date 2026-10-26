import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import type { GuideLandmark } from "@/lib/guide/landmarkTypes";

/** A landmark's sheet (#325): its picture with the photographer's credit, so someone can tell where they are, then Directions. */
export function LandmarkDetails({ landmark: l }: { landmark: GuideLandmark }) {
  const p = l.picture;
  return (
    <div className="space-y-2" data-testid="landmark-sheet">
      {p ? (
        <figure className="space-y-1">
          <img src={p.url} alt={l.name} loading="lazy" className="max-h-48 w-full rounded-lg object-cover" />
          <figcaption className="text-[11px] text-muted-foreground">
            <a href={p.page} target="_blank" rel="noreferrer" className="underline underline-offset-2">Photo</a>
            {p.artist ? ` by ${p.artist}` : ""} · {p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{p.license}</a> : p.license} · Wikimedia Commons
          </figcaption>
        </figure>
      ) : null}
      <DirectionsFromHere lon={l.lon} lat={l.lat} label={l.name} />
    </div>
  );
}
