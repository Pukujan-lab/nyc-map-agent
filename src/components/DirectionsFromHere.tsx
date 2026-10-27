import { useState } from "react";
import { currentOrigin, directionsPair, directionsQuestion, walkOnly } from "@/lib/geo/directionsFromHere";
import { useMapState } from "@/lib/store/MapStateContext";
import { startSharing } from "@/lib/geo/sharedLocation";
import { useDataView } from "@/lib/store/DataViewContext";
import { saveHomeWork, useMemoryPrefs } from "@/lib/memory/memory";

/**
 * A short walk (under WALK_ONLY_M) is drawn straight away. Anything farther asks the trip planner in chat
 * (owner, 2026-10-26), which offers subway and bus with Subway, Bus, Walk and Least walking to pick from;
 * it used to draw a walk however far it was. Labelled; no popup. With a place
 * name, it also offers Save as Home / Save as Work (#313), kept on this device only.
 */
export function DirectionsFromHere({ lon, lat, label }: { lon: number; lat: number; label?: string }) {
  const { setRoutePoint, setFollowingRoute } = useDataView();
  const { seedChat, setChatOpen } = useMapState();
  const [note, setNote] = useState<string | null>(null);
  const keepsHomeWork = useMemoryPrefs().homeWork;
  const save = (which: "home" | "work") => setNote(saveHomeWork(which, { label: label ?? "", lon, lat }) ? `Saved as ${which === "home" ? "Home" : "Work"} on this phone.` : "Couldn't save it here.");
  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        className="h-9 rounded-full bg-acc px-4 text-[13px] font-semibold text-acc-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          const near = currentOrigin();
          if (!walkOnly(near, { lon, lat })) {
            seedChat(directionsQuestion({ lon, lat }, label));
            setChatOpen(true);
            return;
          }
          void (async () => {
            const here = near ?? (await startSharing());
            const pair = directionsPair(here, { lon, lat });
            if (!pair) {
              setNote("Location isn't shared. Allow it, or use My location, then try again.");
              return;
            }
            setNote(null);
            setRoutePoint("start", pair.start);
            setRoutePoint("end", pair.end);
            // The walk card owns the line and its close, as with Walk me there; a bare line had no way to clear it.
            setFollowingRoute(true);
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
