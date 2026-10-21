import type { PointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronUp,
  MapPin,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setSeeThrough, useSeeThrough } from "@/lib/map/seeThrough";
import { WALK_IDLE, type WalkInput } from "@/lib/map/walk";

interface WalkControlsProps {
  /** The block underfoot, so the strip reports what you are walking through. */
  place: { name: string; detail: string } | null;
  /** Nearest intersection, e.g. "W 44 St at 8 Av"; null when no corner is near. */
  corner?: string | null;
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
 * The only chrome the street-level camera adds: a strip that says where you are
 * and how to move, and a d-pad for touch, where there is no keyboard to hold
 * down.
 */
export function WalkControls({
  place,
  corner = null,
  onInput,
  onExit,
}: WalkControlsProps) {
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
      {/*
        Top-left rather than top-centre: the data-loading chip lives in the
        centre, and a window switch while walking must not put the two on top
        of each other.
      */}
      <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)]">
        <div className="pointer-events-auto max-w-full rounded-xl border border-border/70 bg-card/90 py-1.5 pl-3 pr-1 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Camera
              className="h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium">Street level</span>
            {place ? (
              <>
                <span aria-hidden="true" className="text-[11px] text-muted-foreground">
                  ·
                </span>
                <span className="max-w-[38vw] truncate text-[11px] font-medium sm:max-w-none">
                  {place.name}
                </span>
              </>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Leave street level and return to the overhead map"
              className="ml-auto h-7 w-7 shrink-0 rounded-full"
              onClick={onExit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 pr-1 text-[11px] text-muted-foreground">
            {place?.detail ? (
              <span className="tabular-nums">{place.detail}</span>
            ) : null}
            {place?.detail ? (
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
            ) : null}
            <span className="hidden sm:inline">
              W/S move · A/D look · Shift run · Esc to exit
            </span>
            <span className="sm:hidden">Use the pad</span>
          </div>
          <SeeThroughToggle />
        </div>
      </div>

      {corner ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 sm:top-3">
          <div
            data-testid="walk-corner"
            className="flex items-center gap-1.5 rounded-md border border-emerald-900/40 bg-emerald-800/90 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="whitespace-nowrap">{corner}</span>
          </div>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Street-level camera controls"
        className="absolute bottom-32 left-3 z-30 grid sm:bottom-20 grid-cols-3 grid-rows-3 gap-1"
      >
        <span />
        {pad("Walk forward", ChevronUp, {
          forward: 1,
          turn: 0,
          sprint: false,
        })}
        <span />
        {pad("Look left", ArrowLeft, { forward: 0, turn: -1, sprint: false })}
        <span aria-hidden="true" className="self-center justify-self-center">
          <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        </span>
        {pad("Look right", ArrowRight, { forward: 0, turn: 1, sprint: false })}
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

/** Opt-in: buildings fade when you look up (off keeps them solid). */
function SeeThroughToggle() {
  const on = useSeeThrough();
  return (
    <Button type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
      className="pointer-events-auto h-7 self-start rounded-full px-2.5 text-[11px]"
      onClick={() => setSeeThrough(!on)}>
      See through buildings{on ? ": on" : ""}
    </Button>
  );
}
