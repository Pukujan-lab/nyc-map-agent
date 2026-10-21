import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RestroomInfo } from "@/lib/map/restrooms";

/** Simple card for a clicked public restroom: name, hours, accessibility. */
export function RestroomCard({ restroom, onClose }: { restroom: RestroomInfo; onClose: () => void }) {
  const rows: Array<[string, string | null]> = [
    ["Hours", restroom.hours],
    ["Accessibility", restroom.accessibility],
    ["Status", restroom.status],
    ["Operator", restroom.operator],
  ];
  return (
    <Card className="absolute left-1/2 top-3 z-30 w-[min(20rem,calc(100%-1.5rem))] -translate-x-1/2 p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{restroom.name}</div>
        <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 h-7 w-7" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
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
    </Card>
  );
}
