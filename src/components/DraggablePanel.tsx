import { cloneElement, useRef, useState, type ReactElement, type RefAttributes } from "react";
import Draggable, { type DraggableBounds } from "react-draggable";

/** Class for the header that drags a floating panel. */
export const DRAG_HANDLE = "panel-drag-handle";

/**
 * Glue around react-draggable: drag by the header only, never past the
 * viewport, and off on mobile where the panel is a drawer. The child must
 * forward its ref (shadcn `Card` does); the transform goes on it directly.
 * Bounds are measured against the viewport at drag start, because the
 * library's "body"/"parent" bounds assume the panel's offset parent is that
 * element, and these panels sit in absolutely positioned wrappers.
 */
export function DraggablePanel({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactElement<RefAttributes<HTMLDivElement>>;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<DraggableBounds>();
  return (
    <Draggable
      nodeRef={nodeRef}
      handle={`.${DRAG_HANDLE}`}
      cancel="button, a, input"
      bounds={bounds}
      disabled={!enabled}
      onStart={(_event, { x, y }) => {
        const rect = nodeRef.current?.getBoundingClientRect();
        if (!rect) return;
        setBounds({
          left: x - rect.left,
          top: y - rect.top,
          right: x + window.innerWidth - rect.right,
          bottom: y + window.innerHeight - rect.bottom,
        });
      }}
    >
      {cloneElement(children, { ref: nodeRef })}
    </Draggable>
  );
}
