import type { PanelChip } from "@/lib/store/PanelContext";
import type { EventWindow } from "./window";

/**
 * The Today / This weekend chips shown in the Layers & filters drawer while
 * the Events layer is on. Neither active means the next 7 days.
 */
export function eventChips(layerOn: boolean, current: EventWindow, set: (w: EventWindow) => void): PanelChip[] {
  if (!layerOn) return [];
  const chip = (id: string, label: string, w: EventWindow): PanelChip => ({
    id,
    label,
    active: current === w,
    onToggle: () => set(current === w ? "week" : w),
  });
  return [chip("eventsToday", "Events today", "today"), chip("eventsWeekend", "Events this weekend", "weekend")];
}
