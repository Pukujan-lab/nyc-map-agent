import { BusLines } from "./BusLines";
import Nearby from "./Nearby";

/** Layers & filters home: bus pages, then the closest stations. */
export default function TransitHome() {
  return (
    <div className="space-y-[var(--sp-5)]">
      <BusLines />
      <Nearby />
    </div>
  );
}
