import { useStreetHere } from "@/lib/map/streetHere";
import { useMapState } from "@/lib/store/MapStateContext";
import { StreetBubble } from "./StreetBubble";

/** Mounted by FeatureOverlays; shows the bubble only while walking. */
export default function StreetBubbleOverlay() {
  const { walking } = useMapState();
  const street = useStreetHere();
  return walking ? <StreetBubble street={street} /> : null;
}
