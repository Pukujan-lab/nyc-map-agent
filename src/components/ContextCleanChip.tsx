import { Layers } from "lucide-react";
import { useFlag } from "@/lib/flags";
import { setShowAll, useMapContextState } from "@/lib/mapContext/context";
import { useContextClean } from "@/lib/mapContext/useContextClean";

const LABEL: Record<string, string> = {
  following: "Showing your line",
  trip: "Showing your trip",
  walking: "Showing what's nearby",
  place: "Showing this place",
  agent: "Showing the answer",
};

/**
 * Runs the clean-map-by-context hook and, while a context is cleaning the map,
 * offers "Show everything" to opt out until the context changes.
 */
export function ContextCleanChip() {
  useContextClean();
  const on = useFlag("contextClean");
  const { context, showAll } = useMapContextState();
  if (!on || context.kind === "browsing") return null;
  return (
    <div className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+var(--edge)+120px)] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/90 py-1 pl-3 pr-1 text-[11px] text-foreground shadow-lg backdrop-blur-md lg:bottom-[calc(var(--edge)+52px)]lg:left-[calc(50%+190px)]">
      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>{showAll ? "Showing everything" : LABEL[context.kind]}</span>
      <button
        type="button"
        className="h-6 rounded-full bg-secondary px-2.5 text-[11px] font-medium hover:bg-secondary/80"
        aria-pressed={showAll}
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? "Clean map" : "Show everything"}
      </button>
    </div>
  );
}
