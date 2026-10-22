import type { FeatureModule } from "@/lib/features/types";

/**
 * NYC pop-up events: street fairs, markets, pop-ups, outdoor shows, Parks
 * events and event street closures (NYC Open Data, refreshed nightly into
 * core.events). An "Events" chip in Layers & filters, off by default; while
 * on, "Today" / "This weekend" chips narrow the window.
 */
const events: FeatureModule = {
  id: "events",
  layers: () => import("./eventsLayers"),
  chip: { id: "events", label: "Events" },
  overlay: { load: () => import("./EventChips") },
  clickLayers: ["events-pin", "events-now"],
  panel: { idPrefix: "event:" },
  chips: ["eventsToday", "eventsWeekend"],
  flags: ["events"],
  routes: ["/api/events"],
};

export default events;
