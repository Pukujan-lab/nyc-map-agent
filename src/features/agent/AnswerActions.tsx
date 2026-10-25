import { ArrowLeftRight, Ban, BellRing, Bus, ListOrdered, MapPin, Route, TrainFront, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/appLang";
import { distanceText } from "./mapActions";
import type { MapAction, RestroomSpot } from "./schema";

const ICON: Record<MapAction["kind"], typeof MapPin> = { flyTo: MapPin, showRestroom: MapPin, showRoute: Route, showStops: ListOrdered, showCrashes: TriangleAlert, showTrouble: TriangleAlert, remindTrip: BellRing };
const TROUBLE_ICON: Record<Extract<MapAction, { kind: "showTrouble" }>["style"], typeof MapPin> = { problem: TriangleAlert, shuttle: Bus, switch: ArrowLeftRight, stuck: TrainFront };

/** The "show it on the map" buttons under an answer (#371). */
export function AnswerActions({ actions, onRun }: { actions: MapAction[]; onRun: (a: MapAction) => void }) {
  const t = useT();
  if (!actions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Show on the map" data-testid="answer-actions">
      {actions.map((a) => {
        const Icon = a.kind === "showStops" && a.skipped ? Ban : a.kind === "showTrouble" ? TROUBLE_ICON[a.style] : ICON[a.kind];
        return (
          <Button key={a.id} type="button" size="sm" variant="outline" className="h-11 min-h-11 gap-1.5 rounded-full bg-background px-3.5 text-sm" onClick={() => onRun(a)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {a.kind === "remindTrip" ? t("remindMe") : a.label}
          </Button>
        );
      })}
    </div>
  );
}

/** The restroom card an answer button opens in the map panel. */
export function RestroomSpotDetails({ restroom }: { restroom: RestroomSpot }) {
  const rows: Array<[string, string | null]> = [
    ["Distance", distanceText(restroom.distanceM)],
    ["Hours", restroom.hours],
    ["Accessibility", restroom.accessibility],
    ["Status", restroom.status],
    ["Operator", restroom.operator],
  ];
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {rows.filter(([, v]) => v).map(([k, v]) => (
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
