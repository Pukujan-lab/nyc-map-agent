import type { PointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Footprints,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALK_IDLE, type WalkInput } from "@/lib/map/walk";

interface WalkControlsProps {
  /** Fires on press and release; the map reads it every frame. */
  onInput: (input: WalkInput) => void;
  onExit: () => void;
}

function HoldButton({
  label,
  icon: Icon,
  input,
  onInput,
}: {
  label: string;
  icon: typeof ChevronUp;
  input: WalkInput;
  onInput: (input: WalkInput) => void;
}) {
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    // Keeps the pointer bound to this button, so releasing outside it still
    // stops the movement instead of leaving the camera running.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onInput(input);
  };
  const release = () => onInput(WALK_IDLE);

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={label}
      className="h-9 w-9 touch-none select-none rounded-md border-border/70 bg-card/90 shadow-md"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

/**
 * The only chrome walk mode adds: a strip that says how to move, and a d-pad for
 * touch, where there is no keyboard to hold down.
 */
export function WalkControls({ onInput, onExit }: WalkControlsProps) {
  const pad = (label: string, icon: typeof ChevronUp, input: WalkInput) => (
    <HoldButton
      label={label}
      icon={icon}
      input={input}
      onInput={onInput}
    />
  );

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-card/90 py-1 pl-3 pr-1 shadow-xl backdrop-blur-md">
          <Footprints
            className="h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="text-[11px] font-medium">Walking</span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            W/S move · A/D turn · Shift run · Esc to exit
          </span>
          <span className="text-[11px] text-muted-foreground sm:hidden">
            Use the pad
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Stop walking"
            className="h-7 w-7 shrink-0 rounded-full"
            onClick={onExit}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Walk controls"
        className="absolute bottom-20 left-3 z-30 grid grid-cols-3 grid-rows-3 gap-1"
      >
        <span />
        {pad("Walk forward", ChevronUp, {
          forward: 1,
          turn: 0,
          sprint: false,
        })}
        <span />
        {pad("Turn left", ArrowLeft, { forward: 0, turn: -1, sprint: false })}
        <span aria-hidden="true" className="self-center justify-self-center">
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        </span>
        {pad("Turn right", ArrowRight, { forward: 0, turn: 1, sprint: false })}
        <span />
        {pad("Walk backwards", ChevronDown, {
          forward: -1,
          turn: 0,
          sprint: false,
        })}
        <span />
      </div>
    </>
  );
}
