/**
 * "Did you get off at 42 St?": the confirm / undo steps that set the station
 * for the exit flow. Asked as the estimate reaches a station the trip gets off
 * at (a transfer or the destination). Pure, for tests; works with no network.
 */

export type GetOff =
  | { kind: "riding"; dismissed: number[] }
  | { kind: "askOff"; stop: number; dismissed: number[] }
  | { kind: "pickOther"; dismissed: number[] }
  | { kind: "askPlatform"; stop: number; dismissed: number[] }
  | { kind: "confirmed"; stop: number; undoUntil: number; dismissed: number[] };

export type GetOffEvent =
  | { type: "near"; stop: number; getOffStops: number[] }
  | { type: "yes"; now: number }
  | { type: "no" }
  | { type: "other" }
  | { type: "pick"; stop: number }
  | { type: "undo"; now: number };

/** How long Undo stays on screen after confirming. */
export const UNDO_MS = 20_000;

export const riding = (): GetOff => ({ kind: "riding", dismissed: [] });

export function stepGetOff(s: GetOff, e: GetOffEvent): GetOff {
  switch (e.type) {
    case "near":
      // Ask once per stop: a No keeps it quiet until the trip moves on.
      if (s.kind !== "riding" || !e.getOffStops.includes(e.stop) || s.dismissed.includes(e.stop)) return s;
      return { kind: "askOff", stop: e.stop, dismissed: s.dismissed };
    case "yes":
      if (s.kind === "askOff") return { kind: "askPlatform", stop: s.stop, dismissed: s.dismissed };
      if (s.kind === "askPlatform") return { kind: "confirmed", stop: s.stop, undoUntil: e.now + UNDO_MS, dismissed: s.dismissed };
      return s;
    case "no":
      if (s.kind === "askOff" || s.kind === "askPlatform") return { kind: "riding", dismissed: [...s.dismissed, s.stop] };
      if (s.kind === "pickOther") return { kind: "riding", dismissed: s.dismissed };
      return s;
    case "other":
      return s.kind === "askOff" || s.kind === "askPlatform" || s.kind === "riding" ? { kind: "pickOther", dismissed: s.dismissed } : s;
    case "pick":
      return s.kind === "pickOther" ? { kind: "askPlatform", stop: e.stop, dismissed: s.dismissed } : s;
    case "undo":
      if (s.kind === "confirmed") return e.now <= s.undoUntil ? { kind: "riding", dismissed: [...s.dismissed, s.stop] } : s;
      if (s.kind === "askPlatform" || s.kind === "pickOther") return { kind: "riding", dismissed: s.dismissed };
      return s;
  }
}

/** Undo is offered only for a short while after confirming. */
export function canUndo(s: GetOff, now: number): boolean {
  return s.kind === "confirmed" && now <= s.undoUntil;
}
