import { useEffect, useRef, useState } from "react";
import { speakQueued } from "@/lib/voice/tts";

/**
 * Walking the wrong way: the distance to where you should be heading grows by
 * more than WRONG_WAY_M past the closest you have been. Only sharp fixes count,
 * so GPS jitter never warns; walking back toward it clears the warning. Pure, for
 * tests; useWrongWay speaks it once each time it starts.
 */
export const WRONG_WAY_M = 20;
/** Back within this of your closest and you are on track again. */
const BACK_ON_TRACK_M = 5;
/** Fixes vaguer than this (metres) are ignored. */
const SHARP_M = 30;

export interface AwayState {
  /** What you are heading for (a turn, a place); a new one starts over. */
  key: string | null;
  best: number;
  away: boolean;
}

export const initialAway: AwayState = { key: null, best: Number.POSITIVE_INFINITY, away: false };

/** The next state for one fix `d` metres from target `key`, `accuracy` metres sure. */
export function awayStep(s: AwayState, key: string, d: number, accuracy: number | null): AwayState {
  if (key !== s.key) return { key, best: d, away: false };
  if ((accuracy ?? 0) > SHARP_M) return s;
  if (d <= s.best + BACK_ON_TRACK_M && s.away) return { key, best: d, away: false };
  const best = Math.min(s.best, d);
  return { key, best, away: s.away || d - best > WRONG_WAY_M };
}

/** The line to show and say: the place you should be walking toward is behind you. */
export function turnAroundLine(place: string): string {
  return place ? `Turn around, ${place} is behind you` : "Turn around, you're walking away from your route";
}

/**
 * True while you walk away from `target`; says `turnAroundLine(place)` once
 * each time it starts. Null target (not walking) resets.
 */
export function useWrongWay(target: { key: string; metres: number; accuracy: number | null; place: string } | null): boolean {
  const state = useRef(initialAway);
  const [away, setAway] = useState(false);
  const key = target?.key ?? null;
  const metres = target?.metres ?? null;
  useEffect(() => {
    if (!target || metres === null) { state.current = initialAway; setAway(false); return; }
    state.current = awayStep(state.current, target.key, metres, target.accuracy);
    setAway(state.current.away);
  }, [key, metres]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = target?.place ?? "";
  useEffect(() => {
    if (!away || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speakQueued(window.speechSynthesis, turnAroundLine(place), () => {});
  }, [away]); // eslint-disable-line react-hooks/exhaustive-deps
  return away;
}
