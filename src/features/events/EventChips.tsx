import { useEffect, useState } from "react";
import { useFeatureToggles } from "@/lib/featureToggles";
import { usePanelChip } from "@/lib/store/PanelContext";
import { eventChips } from "./chips";
import { getWindow, setWindow, subscribeWindow } from "./window";

/** Registers the Events time chips (drawer) while the Events layer is on. Renders nothing. */
export default function EventChips() {
  const [on] = useFeatureToggles();
  const [w, setW] = useState(getWindow);
  useEffect(() => subscribeWindow(setW), []);
  const [today, weekend] = eventChips(on.has("events"), w, setWindow);
  usePanelChip(today ?? null);
  usePanelChip(weekend ?? null);
  return null;
}
