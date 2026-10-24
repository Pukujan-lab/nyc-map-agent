import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/lib/featureToggles";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { useTransitFocus } from "@/lib/map/transitFocus";
import { setQuickLayer, useQuickLayer, type QuickId } from "@/lib/quickLayers";

type Row = [string, boolean, (v: boolean) => void];
import { useMapState } from "@/lib/store/MapStateContext";

/**
 * The always-there "Layers" button (top-right edge, every view: flat, 3D and
 * street level) and its compact quick drawer: plain on/off switches, outside
 * the main panel. Tap the button again or swipe the drawer right to close.
 * On a phone, --follow-card-h (0 when nothing is followed) drops this button
 * and the open menu below the follow card. The menu scrolls rather than
 * covering the camera row.
 */
function useRow(id: QuickId, label: string): Row {
  return [label, useQuickLayer(id), (v) => setQuickLayer(id, v)];
}

export function QuickLayers() {
  const [open, setOpen] = useState(false);
  const { restrooms, setRestrooms } = useMapState();
  const [focus, setFocus] = useTransitFocus();
  const opts = useMapOptions();
  const [on, toggle] = useFeatureToggles();
  const x0 = useRef<number | null>(null);
  const t = (id: "events" | "parking", label: string): Row => [label, on.has(id), () => toggle(id)];
  const rows: Row[] = [
    useRow("businesses", "Businesses"),
    useRow("streetArt", "Street art"),
    ["Transit Focus", focus, setFocus],
    ["Roads", opts.roads, (v) => setOptions({ roads: v })],
    ["Bus stops", opts.busStops, (v) => setOptions({ busStops: v })],
    useRow("xray", "X-ray"),
    ["Restrooms", restrooms, setRestrooms],
    t("events", "Events"),
    t("parking", "Parking"),
    useRow("health", "Health"),
    useRow("parksPlaces", "Parks & places"),
    useRow("citibike", "Citi Bike"),
  ];
  return (
    <div className="absolute right-[var(--edge)] top-[calc(env(safe-area-inset-top)+var(--edge)+var(--topbar-h)+var(--sp-2)+var(--follow-card-h))] lg:top-[calc(env(safe-area-inset-top)+var(--edge))] z-40 flex flex-col items-end gap-[var(--sp-2)]">
      <button type="button" data-testid="layers-button" aria-expanded={open} onClick={() => setOpen(!open)} className="h-9 rounded-full border border-border bg-card px-[var(--sp-4)] text-[13px] font-semibold text-foreground shadow-md">
        Layers
      </button>
      {open ? (
        <div
          data-testid="quick-layers"
          onPointerDown={(e) => (x0.current = e.clientX)}
          onPointerUp={(e) => { if (x0.current !== null && e.clientX - x0.current > 40) setOpen(false); x0.current = null; }}
          className="w-52 space-y-[var(--sp-1)] overflow-y-auto rounded-[18px] border border-border bg-card p-[var(--sp-3)] text-foreground shadow-xl max-lg:max-h-[calc(100dvh-env(safe-area-inset-top)-var(--edge)*2-var(--topbar-h)-var(--sp-2)*2-var(--follow-card-h)-2.25rem-2.5rem-96px)]"
        >
          {rows.map(([label, value, set]) => (
            <label key={label} className="flex h-9 items-center justify-between gap-2 text-[13px] font-medium">
              {label}
              <Switch checked={value} onCheckedChange={set} aria-label={label} />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
