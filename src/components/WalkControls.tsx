import { useLeftColumn } from "@/lib/store/leftColumn";
import { useFlag } from "@/lib/flags";
import type { PointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MessageCircleQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALK_IDLE, type WalkInput } from "@/lib/map/walk";

interface WalkControlsProps {
  /** The block underfoot, so the strip reports what you are walking through. */
  place: { name: string; detail: string } | null;
  /** Street underfoot and cross street, e.g. "Grand St & Essex St". */
  street?: string | null;
  /** Nearest intersection, e.g. "W 44 St at 8 Av"; null when no corner is near. */
  corner?: string | null;
  /** Fires on press and release; the map reads it every frame. */
  onInput: (input: WalkInput) => void;
  onExit: () => void;
  /** Opens the assistant as a compact sheet with this spot as context. */
  onAsk?: () => void;
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
 * The only chrome the street-level camera adds: a bar that says where you are,
 * and a d-pad that shows how to move.
 */
export function WalkControls({
  place,
  street = null,
  corner = null,
  onInput,
  onExit,
  onAsk,
}: WalkControlsProps) {
  const home = useFlag("agentHome");
  // A wide screen's left column (an answer or a card) would cover the pad: it moves to the column's right.
  const column = useLeftColumn((s) => s.slot !== null);
  // Below the column, an open answer sheet takes the left side and the ask box with it
  // (800×1000: the pad rode --chat-bar-h up to the top left): it moves to the sheet's right.
  const sheet = useLeftColumn((s) => s.sheet);
  const pad = (label: string, icon: typeof ChevronUp, input: WalkInput) => (
    <HoldButton
      label={label}
      icon={icon}
      input={input}
      onInput={onInput}
    />
  );

  // MapView sends "Street & Cross · Landmark ahead": the street heads the bar, the rest goes under it.
  const [here, ...ahead] = (street ?? "").split(" · ");
  const second = [...ahead, corner, place?.name, place?.detail].filter(Boolean).join(" · ");
  return (
    <>
      {/*
        One small bar at the top centre: back to the map, the street you are on,
        what is ahead, and Ask. No legend or key list: the pad shows how to move
        (owner, 2026-10-27).
      */}
      <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-30 flex justify-start sm:justify-center">
        <div data-testid="walk-bar" className="pointer-events-auto flex min-w-0 max-w-[min(100%,560px)] items-center gap-2 rounded-2xl border border-[#263449] bg-[rgba(15,23,42,0.92)] py-1.5 pl-1.5 pr-1.5 text-[#f1f5f9] shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-md max-sm:mr-14">
          <button type="button" onClick={onExit} aria-label="Back to the map"
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Map
          </button>
          <div className="min-w-0 flex-1 px-1">
            <p data-testid="walk-street" aria-live="polite" className="truncate text-[14px] font-semibold leading-tight">
              {here || "Street level"}
            </p>
            {second ? <p data-testid="walk-ahead" className="truncate text-[12px] leading-tight text-[#a5b4cb]">{second}</p> : null}
          </div>
          {onAsk ? (
            <button type="button" aria-label="Ask about this spot" onClick={onAsk}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-[#2563eb] px-3 text-[13px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Ask
            </button>
          ) : null}
        </div>
      </div>

      <div
        role="group"
        aria-label="Street-level camera controls"
        className="absolute left-3 z-30 grid grid-cols-3 grid-rows-3 gap-1 sm:left-6"
        style={column
          ? { left: "calc(var(--edge, 16px) + min(400px, 44vw) + 16px)", bottom: 24 }
          : sheet
            ? { left: "calc(12px + min(420px, 44vw) + 16px)", bottom: 24 }
            : { bottom: home ? "calc(var(--chat-bar-h, 96px) + var(--pull-sheet-h, 0px) + 12px)" : undefined }}
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
