import { Layers3 } from "lucide-react";
import { useMapState } from "@/lib/store/MapStateContext";
import { activeView, setElevated, setXray, useViewState, type CameraView } from "@/lib/map/viewMode";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ id: CameraView; label: string; hint: string }> = [
  { id: "map", label: "Map", hint: "Overhead map" },
  { id: "elevated", label: "Elevated", hint: "About 60 m up, tilted 55°" },
  { id: "street", label: "Street", hint: "Eye level, walk the street" },
];

/**
 * The camera chips "Map · Elevated · Street", with a labelled X-ray toggle
 * beside them (it used to hide in a station card). X-ray reads "auto" while a
 * followed train is underground and the camera turned it on by itself.
 */
export function ViewSwitcher({ streetLevel = true }: { streetLevel?: boolean }) {
  const { walking, startWalk, navigate } = useMapState();
  const { elevated, xray, xrayAuto } = useViewState();
  const active = activeView(walking, elevated);
  const pick = (id: CameraView) => {
    if (id === active) return;
    if (id === "street") { setElevated(false); startWalk(); }
    else navigate(id);
  };
  const xrayLit = xray || xrayAuto;
  return (
    <div className="pointer-events-auto flex items-center gap-1.5" data-testid="view-switcher">
      <div role="radiogroup" aria-label="Camera view" className="flex items-center rounded-full border border-border bg-card/95 p-0.5 shadow-lg backdrop-blur">
        {VIEWS.filter((v) => streetLevel || v.id !== "street").map((v, i) => (
          <span key={v.id} className="flex items-center">
            {i ? <span aria-hidden="true" className="px-0.5 text-[11px] text-muted-foreground">·</span> : null}
            <button
              type="button"
              role="radio"
              aria-checked={active === v.id}
              title={v.hint}
              onClick={() => pick(v.id)}
              className={cn(
                "h-7 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-accent",
              )}
            >
              {v.label}
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={xrayLit}
        title="Buildings and ground see-through; tunnels and underground trains show"
        onClick={() => setXray(!xray)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-lg backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          xrayLit ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/95 text-foreground hover:bg-accent",
        )}
      >
        <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
        X-ray{xrayAuto && !xray ? " · auto" : xray ? " · on" : ""}
      </button>
    </div>
  );
}
