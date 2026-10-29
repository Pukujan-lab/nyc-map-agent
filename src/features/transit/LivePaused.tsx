import { createPortal } from "react-dom";
import { Pause } from "lucide-react";
import { useIdle } from "@/lib/idle";
import { useLeftChips } from "@/lib/store/leftColumn";
import { useLiveWanted } from "./hooks";

/**
 * "Paused — tap to resume": shown after 10 minutes without interaction in a
 * visible tab while live transit is on (#369). Polling stops in the hooks; any
 * pointer, key or touch resumes it, and so does this button. Mounted through
 * the transit feature's `overlay` slot (src/components/FeatureOverlays.tsx).
 */
export default function LivePaused() {
  const { idle, resume } = useIdle();
  const wanted = useLiveWanted();
  const row = useLeftChips();
  if (!idle || !wanted) return null;
  const chip = (
      <button
        type="button"
        onClick={resume}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur hover:bg-muted"
      >
        <Pause className="h-3.5 w-3.5" aria-hidden />
        Live updates paused — tap to resume
      </button>
  );
  // Wide screens: in the chip row at the top of the left side. Phones: centred under the top.
  if (row) return createPortal(chip, row);
  return <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center">{chip}</div>;
}
