import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  DIVIDER_DEFAULT,
  clampDivider,
  nudgeDivider,
  orientationForWidth,
  pointerToPercent,
  type CompareOrientation,
} from "./compareSliderMath";

interface CompareSliderProps {
  /** The 3D street view. Rendered in the first pane; a placeholder shows when omitted. */
  threeD?: ReactNode;
  /** The real-world side: a Mapillary photo (or, later, the camera). */
  photoUrl: string | null;
  photoAlt: string;
  /** Attribution line for the photo, e.g. "Mapillary, CC-BY-SA, 2023". */
  photoCredit?: string;
  /** Force a layout; by default it follows the container width. */
  orientation?: CompareOrientation;
  className?: string;
}

/**
 * Compare mode (#191, phase 2): the 3D street view on one side of a draggable
 * divider, the real photo on the other. Self-contained and not yet mounted;
 * the parent supplies the 3D view through `threeD` and the photo URL.
 */
export function CompareSlider({
  threeD,
  photoUrl,
  photoAlt,
  photoCredit,
  orientation,
  className,
}: CompareSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(DIVIDER_DEFAULT);
  const [auto, setAuto] = useState<CompareOrientation>("under");
  const [dragging, setDragging] = useState(false);
  const layout = orientation ?? auto;
  const horizontal = layout === "beside";

  useEffect(() => {
    const el = trackRef.current;
    if (!el || orientation || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setAuto(orientationForWidth(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation]);

  const moveTo = useCallback(
    (e: PointerEvent) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      setPct(
        horizontal
          ? pointerToPercent(e.clientX, r.left, r.width)
          : pointerToPercent(e.clientY, r.top, r.height),
      );
    },
    [horizontal],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const next = nudgeDivider(pct, e.key, layout, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    setPct(clampDivider(next));
  };

  const size = `${pct}%`;
  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-full min-h-48 w-full overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      <div
        className="absolute inset-0"
        data-testid="compare-photo"
        aria-label={photoAlt}
        role="img"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No photo here
          </div>
        )}
        {photoCredit ? (
          <span className="absolute bottom-1 right-2 rounded bg-background/70 px-1 text-[10px]">
            {photoCredit}
          </span>
        ) : null}
      </div>

      <div
        className="absolute left-0 top-0 overflow-hidden"
        style={
          horizontal
            ? { width: size, height: "100%" }
            : { height: size, width: "100%" }
        }
        data-testid="compare-3d"
      >
        <div className="h-full w-full">
          {threeD ?? (
            <div className="flex h-full w-full items-center justify-center bg-secondary text-sm text-muted-foreground">
              3D street view goes here
            </div>
          )}
        </div>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare 3D view and photo"
        aria-orientation={horizontal ? "horizontal" : "vertical"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          moveTo(e);
        }}
        onPointerMove={(e) => dragging && moveTo(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className={cn(
          "absolute z-10 flex touch-none items-center justify-center bg-background/90 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
          horizontal
            ? "top-0 h-full w-3 -translate-x-1/2 cursor-col-resize"
            : "left-0 h-3 w-full -translate-y-1/2 cursor-row-resize",
        )}
        style={horizontal ? { left: size } : { top: size }}
      >
        <span
          className={cn(
            "rounded-full bg-muted-foreground/60",
            horizontal ? "h-8 w-1" : "h-1 w-8",
          )}
        />
      </div>
    </div>
  );
}
