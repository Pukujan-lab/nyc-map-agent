import type { RestroomInfo } from "@/lib/map/restrooms";

/** A clicked public restroom's details, shown in the map panel. */
export function RestroomDetails({ restroom }: { restroom: RestroomInfo }) {
  const rows: Array<[string, string | null]> = [
    ["Hours", restroom.hours],
    ["Accessibility", restroom.accessibility],
    ["Status", restroom.status],
    ["Operator", restroom.operator],
  ];
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-foreground">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-2 text-[10px] text-muted-foreground">NYC Open Data · Public Restrooms</div>
    </div>
  );
}
