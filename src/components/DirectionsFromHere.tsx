import { useState } from "react";
import { currentOrigin, directionsPair } from "@/lib/geo/directionsFromHere";
import { startSharing } from "@/lib/geo/sharedLocation";
import { useDataView } from "@/lib/store/DataViewContext";

/** Sets a walking route from the current location to this point. Labelled; no popup. */
export function DirectionsFromHere({ lon, lat }: { lon: number; lat: number }) {
  const { setRoutePoint } = useDataView();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        className="h-9 rounded-full bg-acc px-4 text-[13px] font-semibold text-acc-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          void (async () => {
            const here = currentOrigin() ?? (await startSharing());
            const pair = directionsPair(here, { lon, lat });
            if (!pair) {
              setNote("Location isn't shared. Allow it, or use My location, then try again.");
              return;
            }
            setNote(null);
            setRoutePoint("start", pair.start);
            setRoutePoint("end", pair.end);
          })();
        }}
      >
        Directions from here
      </button>
      {note ? <p className="text-[11px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}
