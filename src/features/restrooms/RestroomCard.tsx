import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import type { RestroomInfo } from "./layers";

/** A clicked public restroom's details, shown in the map panel. */
export function RestroomDetails({ restroom, distanceLabel }: { restroom: RestroomInfo; distanceLabel?: string | null }) {
  const rows: Array<[string, string | null]> = [
    ["Hours", restroom.hours],
    ["Accessibility", restroom.accessibility],
    ["Status", restroom.status],
    ["Operator", restroom.operator],
  ];
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
      <DirectionsFromHere lon={restroom.lon} lat={restroom.lat} />
      <div className="mt-2 text-[10px] text-muted-foreground">NYC Open Data · Public Restrooms</div>
    </div>
  );
}
