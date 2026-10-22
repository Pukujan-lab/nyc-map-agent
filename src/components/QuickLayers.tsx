import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useFeatureToggles } from "@/lib/featureToggles";
import { useTransitFocus } from "@/lib/map/transitFocus";
import { setQuickLayer, useQuickLayer } from "@/lib/quickLayers";
import { useMapState } from "@/lib/store/MapStateContext";

/**
 * The always-there "Layers" button (top-right edge, every view: flat, 3D and
 * street level) and its compact quick drawer: plain on/off switches, outside
 * the main panel. Tap the button again or swipe the drawer right to close.
 */
export function QuickLayers() {
  const [open, setOpen] = useState(false);
  const { restrooms, setRestrooms } = useMapState();
  const [focus, setFocus] = useTransitFocus();
  const [on, toggle] = useFeatureToggles();
  const businesses = useQuickLayer("businesses");
  const art = useQuickLayer("streetArt");
  const xray = useQuickLayer("xray");
  const x0 = useRef<number | null>(null);
  const rows: Array<[string, boolean, (v: boolean) => void]> = [
    ["Businesses", businesses, (v) => setQuickLayer("businesses", v)],
    ["Street art", art, (v) => setQuickLayer("streetArt", v)],
    ["Transit Focus", focus, setFocus],
    ["X-ray", xray, (v) => setQuickLayer("xray", v)],
    ["Restrooms", restrooms, setRestrooms],
    ["Events", on.has("events"), () => toggle("events")],
    ["Parking", on.has("parking"), () => toggle("parking")],
  ];
  return (
    <div className="absolute right-[var(--edge)] top-[calc(env(safe-area-inset-top)+var(--edge))] z-40 flex flex-col items-end gap-[var(--sp-2)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="h-9 rounded-full border border-border bg-card px-[var(--sp-4)] text-[13px] font-semibold text-foreground shadow-md">
        Layers
      </button>
      {open ? (
        <div
          data-testid="quick-layers"
          onPointerDown={(e) => (x0.current = e.clientX)}
          onPointerUp={(e) => { if (x0.current !== null && e.clientX - x0.current > 40) setOpen(false); x0.current = null; }}
          className="w-52 space-y-[var(--sp-1)] rounded-[18px] border border-border bg-card p-[var(--sp-3)] text-foreground shadow-xl"
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
