import { useState } from "react";
import { Footprints } from "lucide-react";
import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import { Button } from "@/components/ui/button";
import { currentOrigin } from "@/lib/geo/directionsFromHere";
import { startSharing } from "@/lib/geo/sharedLocation";
import { useDataView } from "@/lib/store/DataViewContext";
import type { RestroomInfo } from "./layers";
import { RestroomPhoto } from "./RestroomPhoto";
import { restroomRows, restroomSourceLine } from "./source";

/** A clicked public restroom's details, shown in the map panel. */
export function RestroomDetails({ restroom, distanceLabel }: { restroom: RestroomInfo; distanceLabel?: string | null }) {
  const { beginRestroomTrip } = useDataView();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rows = restroomRows(restroom);

  const simulate = () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    void (async () => {
      try {
        // The tap is the gesture that may show the browser's location prompt.
        const here = currentOrigin() ?? (await startSharing());
        if (!here) {
          setNote("Location isn't shared. Allow it, or use My location, then try again.");
          return;
        }
        beginRestroomTrip(here, { lon: restroom.lon, lat: restroom.lat });
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div>
      {distanceLabel ? <p className="mb-2 text-xs text-foreground">{distanceLabel}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="whitespace-pre-line text-foreground">{v}</dd>
            </div>
          ))}
      </dl>
      <RestroomPhoto lon={restroom.lon} lat={restroom.lat} name={restroom.name} />
      <DirectionsFromHere lon={restroom.lon} lat={restroom.lat} />
      <Button
        type="button"
        size="sm"
        className="mt-2 h-8 w-full text-[11px]"
        disabled={busy}
        onClick={simulate}
      >
        <Footprints className="h-3.5 w-3.5" />
        Simulate trip
      </Button>
      {note ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p> : null}
      <div className="mt-2 text-[10px] text-muted-foreground">{restroomSourceLine(restroom)}</div>
    </div>
  );
}
