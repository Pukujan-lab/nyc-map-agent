import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import { Button } from "@/components/ui/button";
import { ACCESS_LABEL, KIND_LABEL, type PlaceToiletProps } from "./data";

/** Access badge: "Anyone" or "Customers only", plus a wheelchair mark where OSM tags it. */
function AccessBadge({ place }: { place: PlaceToiletProps }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={
          place.access === "anyone"
            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
            : "rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-800"
        }
      >
        {ACCESS_LABEL[place.access]}
      </span>
      {place.wheelchair ? (
        <span role="img" aria-label="Wheelchair accessible toilet" className="text-[13px] leading-none">
          ♿
        </span>
      ) : null}
    </span>
  );
}

/** A tapped shop / café toilet: name (panel title), access, source link, directions from here. */
export function PlaceToiletSheet({ place, lon, lat }: { place: PlaceToiletProps; lon: number; lat: number }) {
  const extras = [
    place.changingTable ? "Changing table" : null,
    place.fee === true ? "Fee" : place.fee === false ? "Free" : null,
    place.accessTagged ? null : "Access not tagged; assume customers only",
  ].filter(Boolean);
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Toilet access</span>
        <AccessBadge place={place} />
      </div>
      {extras.length ? <div className="text-muted-foreground">{extras.join(" · ")}</div> : null}
      <DirectionsFromHere lon={lon} lat={lat} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild type="button" size="sm" variant="outline" className="h-8 text-[11px]">
          <a href={place.url} target="_blank" rel="noreferrer">
            Source: OpenStreetMap
          </a>
        </Button>
      </div>
      <div className="text-[10px] text-muted-foreground">{KIND_LABEL[place.kind] ?? "Place"} · © OpenStreetMap contributors (ODbL)</div>
    </div>
  );
}
