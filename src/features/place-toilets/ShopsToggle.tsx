import { useCallback, useEffect } from "react";
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
  // A stable handler: a fresh arrow re-registered the chip on every render, and the
  // registration re-rendered this component through the panel context (an endless loop).
  const onToggle = useCallback(() => toggle(SHOPS_CHIP), [toggle]);
  usePanelChip(restrooms ? { id: SHOPS_CHIP, label: "Include shops & cafés", active, onToggle } : null);
  return null;
}
