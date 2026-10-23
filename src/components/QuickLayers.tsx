import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/lib/featureToggles";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { useTransitFocus } from "@/lib/map/transitFocus";
import { setQuickLayer, useQuickLayer, type QuickId } from "@/lib/quickLayers";

type Row = [string, boolean, (v: boolean) => void];
import { useMapState } from "@/lib/store/MapStateContext";

/**
 * The "Layers" quick dropdown: plain on/off switches. It sits in the top bar's
 * button row beside "Layers & filters" and Transit, so the top of the screen
 * has one controls bar instead of a second floating button. The menu opens
 * under the row, scrolls rather than covering the camera row, closes on a tap
 * outside it, and closes on a swipe right.
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
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
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
    <div ref={root} className="relative">
      <button type="button" data-testid="layers-button" aria-expanded={open} onClick={() => setOpen(!open)} className="h-9 rounded-full border border-border bg-card px-[var(--sp-4)] text-[13px] font-semibold text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Layers
      </button>
      {open ? (
        <div
          data-testid="quick-layers"
          onPointerDown={(e) => (x0.current = e.clientX)}
          onPointerUp={(e) => { if (x0.current !== null && e.clientX - x0.current > 40) setOpen(false); x0.current = null; }}
          className="absolute right-0 top-full z-40 mt-[var(--sp-2)] max-h-[60dvh] w-52 space-y-[var(--sp-1)] overflow-y-auto rounded-[18px] border border-border bg-card p-[var(--sp-3)] text-foreground shadow-xl"
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
