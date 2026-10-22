import { Button } from "@/components/ui/button";
import { useDataView } from "@/lib/store/DataViewContext";
import { SOURCE_LABEL, type EventProps } from "./data";
import { formatWhen } from "./window";

/** A tapped event: time, place, source link, Directions. Labelled buttons only. */
export function EventSheet({ event, lon, lat }: { event: EventProps; lon: number; lat: number }) {
  const { setRoutePoint, setRoutePicking } = useDataView();
  return (
    <div className="space-y-2 text-xs">
      <div className="text-foreground">{formatWhen(event.start, event.end)}</div>
      {event.address ? <div className="text-muted-foreground">{event.address}</div> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-8 text-[11px]"
          onClick={() => {
            setRoutePoint("end", { lon, lat });
            setRoutePicking("start");
          }}
        >
          Directions
        </Button>
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
