import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/lib/featureToggles";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { useTransitFocus } from "@/lib/map/transitFocus";
import { setQuickLayer, useQuickLayer, type QuickId } from "@/lib/quickLayers";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel } from "@/lib/store/PanelContext";

type Row = [string, boolean, (v: boolean) => void];

/**
 * Desktop "Layers" button (top-right) and its compact list of switches.
 * Phones use "Layers & filters" instead, so this button does not cover the
 * search bar or the view row. Tap the button again or swipe the list closed.
 */
function useRow(id: QuickId, label: string): Row {
  return [label, useQuickLayer(id), (v) => setQuickLayer(id, v)];
}

export function QuickLayers() {
  const [open, setOpen] = useState(false);
  const { restrooms, setRestrooms } = useMapState();
  const { drawerOpen, setDrawerOpen } = usePanel();
  const opts = useMapOptions();
  const [focus, setFocus] = useTransitFocus();
  const [on, toggle] = useFeatureToggles();
  const x0 = useRef<number | null>(null);
  // The phone already has "Layers & filters". This second button sat on the
  // search bar and the view row, so it stays desktop-only.
  useEffect(() => { if (drawerOpen) setOpen(false); }, [drawerOpen]);
  const toggleOpen = () => setOpen((v) => {
    const next = !v;
    if (next) setDrawerOpen(false);
    return next;
  });
  const t = (id: "events" | "parking", label: string): Row => [label, on.has(id), () => toggle(id)];
  const rows: Row[] = [
    useRow("businesses", "Businesses"),
    useRow("streetArt", "Street art"),
    ["Transit Focus", focus, setFocus],
    useRow("xray", "X-ray"),
    ["Bus stops", opts.busStops, (v) => setOptions({ busStops: v })],
    useRow("schools", "Schools"),
    ["Restrooms", restrooms, setRestrooms],
    t("events", "Events"),
    t("parking", "Parking"),
    useRow("health", "Health"),
    useRow("parksPlaces", "Parks & places"),
    useRow("citibike", "Citi Bike"),
  ];
  return (
    <div className="absolute right-[var(--edge)] top-[calc(env(safe-area-inset-top)+var(--edge))] z-40 hidden flex-col items-end gap-[var(--sp-2)] lg:flex">
      <button type="button" aria-expanded={open} onClick={toggleOpen} className="h-9 rounded-full border border-border bg-card px-[var(--sp-4)] text-[13px] font-semibold text-foreground shadow-md">
        Layers
      </button>
      {open ? (
        <div
          data-testid="quick-layers"
          onPointerDown={(e) => (x0.current = e.clientX)}
          onPointerUp={(e) => { if (x0.current !== null && e.clientX - x0.current > 40) setOpen(false); x0.current = null; }}
          className="max-h-[min(70vh,32rem)] w-52 space-y-[var(--sp-1)] overflow-y-auto rounded-[18px] border border-border bg-card p-[var(--sp-3)] text-foreground shadow-xl"
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
