import { useState } from "react";
import { currentOrigin, directionsPair } from "@/lib/geo/directionsFromHere";
import { startSharing } from "@/lib/geo/sharedLocation";
import { useDataView } from "@/lib/store/DataViewContext";
import { saveHomeWork, useMemoryPrefs } from "@/lib/memory/memory";

/**
 * Sets a walking route from the current location to this point. Labelled; no popup. With a place
 * name, it also offers Save as Home / Save as Work (#313), kept on this device only.
 */
export function DirectionsFromHere({ lon, lat, label }: { lon: number; lat: number; label?: string }) {
  const { setRoutePoint } = useDataView();
  const [note, setNote] = useState<string | null>(null);
  const keepsHomeWork = useMemoryPrefs().homeWork;
  const save = (which: "home" | "work") => setNote(saveHomeWork(which, { label: label ?? "", lon, lat }) ? `Saved as ${which === "home" ? "Home" : "Work"} on this phone.` : "Couldn't save it here.");
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
      {label && keepsHomeWork ? (
        <div className="flex gap-1.5">
          {(["home", "work"] as const).map((w) => (
            <button key={w} type="button" onClick={() => save(w)}
              className="h-8 rounded-full border border-border px-3 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Save as {w === "home" ? "Home" : "Work"}
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="text-[11px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}
