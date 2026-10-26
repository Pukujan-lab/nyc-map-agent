import { useSyncExternalStore } from "react";
import { assign, createActor, setup } from "xstate";
import { setOpenMenu } from "@/lib/store/openMenu";

/**
 * Who gets the screen (docs/PDD.md, "Screen space: who wins and what closes
 * what"). Surfaces report what is open; this machine decides what shows, what
 * folds to its chip or pill, and which menu closes. Ranks, highest first: an
 * active task, the voice orb, the answer card, the line panel, a menu dropdown.
 *
 * - The answer folds to its question chip while a task runs or a menu is open,
 *   and on a small phone when the line panel is opened over it.
 * - On a phone the line panel folds to its pill while the answer or the orb is
 *   open; from 640 px it docks to the side and both stay.
 * - A task, the orb or a line opening closes an open menu; so does sending.
 * - Tapping a chip or pill opens that surface again until something new opens.
 * - A question the person sends opens its answer, even during a task ("I'm lost").
 */
export type ScreenSize = "small" | "phone" | "wide";

export interface ScreenFacts {
  size: ScreenSize;
  task: boolean;
  voice: boolean;
  answer: boolean;
  line: boolean;
  menu: boolean;
  /** The person tapped the answer's chip (or sent a question) since the last fold. */
  answerReveal: boolean;
  /** The person tapped the line pill since the last fold. */
  lineReveal: boolean;
}

export type ScreenEvent =
  | { type: "SIZE"; size: ScreenSize }
  | { type: "TASK" | "VOICE" | "ANSWER" | "LINE" | "MENU"; on: boolean }
  | { type: "SEND" | "SHOW_ANSWER" | "SHOW_LINE" };

const answerFolds = (c: ScreenFacts) => !c.answerReveal && (c.task || c.menu || (c.size === "small" && c.line && c.lineReveal));
const answerOpen = (c: ScreenFacts) => c.answer && !answerFolds(c);
const lineFolds = (c: ScreenFacts) => c.size !== "wide" && !c.lineReveal && (answerOpen(c) || c.voice);

const rising = (key: "task" | "voice" | "line" | "menu") => ({ context: c, event: e }: { context: ScreenFacts; event: ScreenEvent }) =>
  "on" in e && e.on && !c[key];

export const screenMachine = setup({
  types: { context: {} as ScreenFacts, events: {} as ScreenEvent, input: {} as Partial<ScreenFacts> },
  actions: { menuShut: assign({ menu: false }), closeMenu: () => setOpenMenu(null) },
  guards: {
    answerShows: ({ context }) => answerOpen(context),
    answerFolds: ({ context }) => context.answer && answerFolds(context),
    lineShows: ({ context }) => context.line && !lineFolds(context),
    lineFolds: ({ context }) => context.line && lineFolds(context),
  },
}).createMachine({
  id: "screen",
  context: ({ input }) => ({ size: "phone", task: false, voice: false, answer: false, line: false, menu: false, answerReveal: false, lineReveal: false, ...input }),
  type: "parallel",
  on: {
    SIZE: { actions: assign({ size: ({ event }) => event.size }) },
    TASK: [
      { guard: rising("task"), actions: [assign({ task: true, answerReveal: false }), "menuShut", "closeMenu"] },
      { actions: assign({ task: ({ event }) => event.on }) },
    ],
    VOICE: [
      { guard: rising("voice"), actions: [assign({ voice: true, lineReveal: false }), "menuShut", "closeMenu"] },
      { actions: assign({ voice: ({ event }) => event.on }) },
    ],
    LINE: [
      { guard: rising("line"), actions: [assign({ line: true, lineReveal: false }), "menuShut", "closeMenu"] },
      { actions: assign({ line: ({ event }) => event.on, lineReveal: false }) },
    ],
    MENU: [
      { guard: rising("menu"), actions: assign({ menu: true, answerReveal: false }) },
      { actions: assign({ menu: ({ event }) => event.on }) },
    ],
    // A question the person just sent (SEND) opens its answer even over a task: only a closing answer forgets that.
    ANSWER: { guard: ({ context, event }) => event.on !== context.answer, actions: assign({ answer: ({ event }) => event.on, answerReveal: ({ context, event }) => event.on && context.answerReveal, lineReveal: false }) },
    SEND: { actions: [assign({ answerReveal: true, lineReveal: false }), "menuShut", "closeMenu"] },
    SHOW_ANSWER: { actions: [assign({ answerReveal: true, lineReveal: false }), "menuShut", "closeMenu"] },
    SHOW_LINE: { actions: assign({ lineReveal: true, answerReveal: false }) },
  },
  states: {
    answer: {
      initial: "none",
      states: {
        none: { always: [{ guard: "answerShows", target: "open" }, { guard: "answerFolds", target: "chip" }] },
        open: { always: [{ guard: "answerFolds", target: "chip" }, { guard: ({ context }) => !context.answer, target: "none" }] },
        chip: { always: [{ guard: "answerShows", target: "open" }, { guard: ({ context }) => !context.answer, target: "none" }] },
      },
    },
    line: {
      initial: "none",
      states: {
        none: { always: [{ guard: "lineShows", target: "open" }, { guard: "lineFolds", target: "pill" }] },
        open: { always: [{ guard: "lineFolds", target: "pill" }, { guard: ({ context }) => !context.line, target: "none" }] },
        pill: { always: [{ guard: "lineShows", target: "open" }, { guard: ({ context }) => !context.line, target: "none" }] },
      },
    },
  },
});

export type ScreenView = { answer: "none" | "open" | "chip"; line: "none" | "open" | "pill" };

const actor = createActor(screenMachine, { input: {} });
actor.start();

export const sendScreen = (event: ScreenEvent): void => actor.send(event);

/** What the answer and the line panel should show right now. */
export function useScreen<T>(pick: (v: ScreenView) => T): T {
  return useSyncExternalStore(
    (f) => { const s = actor.subscribe(f); return () => s.unsubscribe(); },
    () => pick(actor.getSnapshot().value as ScreenView),
    () => pick(actor.getSnapshot().value as ScreenView),
  );
}

/** The screen's size class: "wide" from 640 px, which docks panels to the side instead of over the chat. */
export function useScreenSize(): ScreenSize {
  return useSyncExternalStore(
    (f) => { const s = actor.subscribe(f); return () => s.unsubscribe(); },
    () => actor.getSnapshot().context.size,
    () => actor.getSnapshot().context.size,
  );
}

const sizeOf = (): ScreenSize =>
  window.matchMedia("(min-width: 640px)").matches ? "wide" : window.matchMedia("(max-width: 374px), (max-height: 699px)").matches ? "small" : "phone";

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const update = () => sendScreen({ type: "SIZE", size: sizeOf() });
  for (const q of ["(min-width: 640px)", "(max-width: 374px), (max-height: 699px)"]) window.matchMedia(q).addEventListener?.("change", update);
  update();
}
