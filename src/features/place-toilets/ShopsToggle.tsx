import { useEffect } from "react";
import { useFeatureToggles } from "@/lib/featureToggles";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanelChip } from "@/lib/store/PanelContext";
import { setShopsEnabled, SHOPS_CHIP } from "./store";

/**
 * Registers the "Include shops & cafés" chip (Layers & filters, next to
 * Restrooms) while the Restrooms layer is on; off by default (`on=restroomShops`).
 * Renders nothing.
 */
export default function ShopsToggle() {
  const { restrooms } = useMapState();
  const [on, toggle] = useFeatureToggles();
  const active = on.has(SHOPS_CHIP);
  useEffect(() => setShopsEnabled(restrooms && active), [restrooms, active]);
  useEffect(() => () => setShopsEnabled(false), []);
  usePanelChip(restrooms ? { id: SHOPS_CHIP, label: "Include shops & cafés", active, onToggle: () => toggle(SHOPS_CHIP) } : null);
  return null;
}
