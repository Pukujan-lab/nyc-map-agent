import { useCallback, useSyncExternalStore } from "react";

/** How long a visible tab may go without a pointer, key or touch before live updates pause. */
export const IDLE_MS = 10 * 60_000;

const ACTIVITY = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;

type Doc = EventTarget & { visibilityState: string };

export type IdleWatcher = {
  isIdle: () => boolean;
  /** Counts as interaction: clears idle and restarts the countdown. */
  poke: () => void;
  subscribe: (fn: () => void) => () => void;
  dispose: () => void;
};

/**
 * Idle after `timeoutMs` of no pointer, key or touch input while the tab is
 * visible. A hidden tab stops the countdown (react-query already stops polling
 * there) and a fresh one starts when it is shown again. Idle ends on the next
 * interaction.
 */
export function createIdleWatcher(opts: { timeoutMs: number; win: EventTarget; doc: Doc; now?: () => number }): IdleWatcher {
  const { timeoutMs, win, doc } = opts;
  const now = opts.now ?? Date.now;
  const listeners = new Set<() => void>();
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArm = -Infinity;

  const set = (v: boolean) => {
    if (idle === v) return;
    idle = v;
    listeners.forEach((l) => l());
  };
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    stop();
    lastArm = now();
    if (doc.visibilityState === "visible") timer = setTimeout(() => { timer = undefined; set(true); }, timeoutMs);
  };
  const activity = () => {
    // pointermove fires constantly; re-arming once a second is plenty.
    if (!idle && timer !== undefined && now() - lastArm < 1000) return;
    set(false);
    arm();
  };
  const onVisibility = () => (doc.visibilityState === "visible" ? arm() : stop());

  for (const e of ACTIVITY) win.addEventListener(e, activity, { passive: true, capture: true });
  doc.addEventListener("visibilitychange", onVisibility);
  arm();

  return {
    isIdle: () => idle,
    poke: () => { set(false); arm(); },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispose: () => {
      stop();
      for (const e of ACTIVITY) win.removeEventListener(e, activity, { capture: true });
      doc.removeEventListener("visibilitychange", onVisibility);
      listeners.clear();
    },
  };
}

// One shared watcher while anything is listening.
let shared: IdleWatcher | null = null;
let users = 0;
function subscribeShared(fn: () => void) {
  if (!shared) shared = createIdleWatcher({ timeoutMs: IDLE_MS, win: window, doc: document });
  users++;
  const off = shared.subscribe(fn);
  return () => {
    off();
    if (--users === 0) { shared?.dispose(); shared = null; }
  };
}

/** `idle` is true after IDLE_MS without interaction in a visible tab; `resume` ends it. */
export function useIdle(): { idle: boolean; resume: () => void } {
  const idle = useSyncExternalStore(subscribeShared, () => shared?.isIdle() ?? false, () => false);
  const resume = useCallback(() => shared?.poke(), []);
  return { idle, resume };
}
