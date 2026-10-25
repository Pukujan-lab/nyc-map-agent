import { formatStreetText } from "@/lib/streetName";
import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import { Button } from "@/components/ui/button";
import { SOURCE_LABEL, type EventProps } from "./data";
import { formatWhen } from "./window";

/** A tapped event: time, place, source link, directions from the current location. */
export function EventSheet({ event, lon, lat }: { event: EventProps; lon: number; lat: number }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="text-foreground">{formatWhen(event.start, event.end)}</div>
      {event.address ? <div className="text-muted-foreground">{formatStreetText(event.address)}</div> : null}
      <DirectionsFromHere lon={lon} lat={lat} />
      <div className="flex flex-wrap gap-2 pt-1">
        {event.url ? (
          <Button asChild type="button" size="sm" variant="outline" className="h-8 text-[11px]">
            <a href={event.url} target="_blank" rel="noreferrer">
              Source: {SOURCE_LABEL[event.source]}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
