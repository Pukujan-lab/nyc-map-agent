import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdleWatcher } from "./idle";

const MIN = 60_000;

function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as string });
  const w = createIdleWatcher({ timeoutMs: 10 * MIN, win, doc, now: () => Date.now() });
  const show = (state: "visible" | "hidden") => { doc.visibilityState = state; doc.dispatchEvent(new Event("visibilitychange")); };
  return { win, doc, w, show };
}

describe("createIdleWatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("goes idle after 10 minutes without interaction in a visible tab, and notifies", () => {
    const { w } = setup();
    const fn = vi.fn();
    w.subscribe(fn);
    vi.advanceTimersByTime(10 * MIN - 1);
    expect(w.isIdle()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(w.isIdle()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    w.dispose();
  });

  it("restarts the countdown on pointer, key or touch input", () => {
    const { w, win } = setup();
    for (const type of ["pointerdown", "keydown", "touchstart"]) {
      vi.advanceTimersByTime(9 * MIN);
      win.dispatchEvent(new Event(type));
    }
    vi.advanceTimersByTime(9 * MIN);
    expect(w.isIdle()).toBe(false);
    vi.advanceTimersByTime(MIN);
    expect(w.isIdle()).toBe(true);
    w.dispose();
  });

  it("resumes on the next interaction or poke", () => {
    const { w, win } = setup();
    vi.advanceTimersByTime(10 * MIN);
    win.dispatchEvent(new Event("pointermove"));
    expect(w.isIdle()).toBe(false);
    vi.advanceTimersByTime(10 * MIN);
    expect(w.isIdle()).toBe(true);
    w.poke();
    expect(w.isIdle()).toBe(false);
    w.dispose();
  });

  it("does not count time while the tab is hidden, and starts afresh when shown", () => {
    const { w, show } = setup();
    vi.advanceTimersByTime(5 * MIN);
    show("hidden");
    vi.advanceTimersByTime(60 * MIN);
    expect(w.isIdle()).toBe(false);
    show("visible");
    vi.advanceTimersByTime(9 * MIN);
    expect(w.isIdle()).toBe(false);
    vi.advanceTimersByTime(MIN);
    expect(w.isIdle()).toBe(true);
    w.dispose();
  });

  it("stops listening after dispose", () => {
    const { w, win } = setup();
    const fn = vi.fn();
    w.subscribe(fn);
    w.dispose();
    vi.advanceTimersByTime(20 * MIN);
    win.dispatchEvent(new Event("keydown"));
    expect(fn).not.toHaveBeenCalled();
  });
});
