import { describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { screenMachine, type ScreenEvent, type ScreenSize } from "./screenSpace";

type Surface = "task" | "voice" | "answer" | "line" | "menu";
type Shown = "open" | "chip" | "pill" | "closed";

const OPEN: Record<Surface, ScreenEvent> = {
  task: { type: "TASK", on: true },
  voice: { type: "VOICE", on: true },
  answer: { type: "ANSWER", on: true },
  line: { type: "LINE", on: true },
  menu: { type: "MENU", on: true },
};

function run(size: ScreenSize, ...events: ScreenEvent[]) {
  const closeMenu = vi.fn();
  const actor = createActor(screenMachine.provide({ actions: { closeMenu } }), { input: { size } }).start();
  events.forEach((e) => actor.send(e));
  const { value, context: c } = actor.getSnapshot() as unknown as { value: { answer: string; line: string }; context: Record<Surface, boolean> };
  const shown = (s: Surface): Shown => {
    if (s === "answer") return value.answer === "none" ? "closed" : (value.answer as Shown);
    if (s === "line") return value.line === "none" ? "closed" : (value.line as Shown);
    return c[s] ? "open" : "closed";
  };
  return { shown, closeMenu };
}

const ALL: ScreenSize[] = ["small", "phone", "wide"];
const PHONES: ScreenSize[] = ["small", "phone"];

/**
 * Every pair of depth-1 surfaces that can be open together, opened in both
 * orders, at each screen size: what each of the two shows afterwards
 * (docs/PDD.md, "Who wins" and "By screen size"). Written out by hand on purpose.
 */
const PAIRS: Array<{ first: Surface; then: Surface; sizes: ScreenSize[]; expect: Partial<Record<Surface, Shown>>; why: string }> = [
  { first: "task", then: "voice", sizes: ALL, expect: { task: "open", voice: "open" }, why: "the overlay ends hands-free itself when a task starts" },
  { first: "voice", then: "task", sizes: ALL, expect: { task: "open", voice: "open" }, why: "the overlay ends hands-free itself when a task starts" },
  { first: "task", then: "answer", sizes: ALL, expect: { task: "open", answer: "chip" }, why: "a task outranks the answer" },
  { first: "answer", then: "task", sizes: ALL, expect: { task: "open", answer: "chip" }, why: "starting a task folds the answer" },
  { first: "task", then: "line", sizes: ALL, expect: { task: "open", line: "open" }, why: "a walk keeps the line; following a train hides it in the transit layer" },
  { first: "line", then: "task", sizes: ALL, expect: { task: "open", line: "open" }, why: "a walk keeps the line" },
  { first: "menu", then: "task", sizes: ALL, expect: { task: "open", menu: "closed" }, why: "a task closes the menu" },
  { first: "task", then: "menu", sizes: ALL, expect: { task: "open", menu: "open" }, why: "the menu row is hidden during a task, so this only happens by keyboard" },
  { first: "voice", then: "answer", sizes: ALL, expect: { voice: "open", answer: "open" }, why: "the orb and the answer share one sheet" },
  { first: "answer", then: "voice", sizes: ALL, expect: { voice: "open", answer: "open" }, why: "the orb and the answer share one sheet" },
  { first: "voice", then: "line", sizes: PHONES, expect: { voice: "open", line: "pill" }, why: "on a phone the orb outranks the line panel" },
  { first: "line", then: "voice", sizes: PHONES, expect: { voice: "open", line: "pill" }, why: "on a phone the orb outranks the line panel" },
  { first: "voice", then: "line", sizes: ["wide"], expect: { voice: "open", line: "open" }, why: "from 640 px they dock to opposite sides" },
  { first: "line", then: "voice", sizes: ["wide"], expect: { voice: "open", line: "open" }, why: "from 640 px they dock to opposite sides" },
  { first: "menu", then: "voice", sizes: ALL, expect: { voice: "open", menu: "closed" }, why: "the orb outranks a menu" },
  { first: "voice", then: "menu", sizes: ALL, expect: { voice: "open", menu: "open" }, why: "a menu opened on purpose sits above the orb" },
  { first: "answer", then: "line", sizes: PHONES, expect: { answer: "open", line: "pill" }, why: "on a phone the answer outranks the line panel" },
  { first: "line", then: "answer", sizes: PHONES, expect: { answer: "open", line: "pill" }, why: "on a phone the answer outranks the line panel" },
  { first: "answer", then: "line", sizes: ["wide"], expect: { answer: "open", line: "open" }, why: "from 640 px they dock to opposite sides" },
  { first: "line", then: "answer", sizes: ["wide"], expect: { answer: "open", line: "open" }, why: "from 640 px they dock to opposite sides" },
  { first: "answer", then: "menu", sizes: ALL, expect: { answer: "chip", menu: "open" }, why: "the dropdown is the single focus" },
  { first: "menu", then: "answer", sizes: ALL, expect: { answer: "chip", menu: "open" }, why: "the dropdown is the single focus until it closes" },
  { first: "menu", then: "line", sizes: ALL, expect: { line: "open", menu: "closed" }, why: "picking a line closes the menu" },
  { first: "line", then: "menu", sizes: ALL, expect: { line: "open", menu: "open" }, why: "the menu row is hidden while a line is active, so this only happens by keyboard" },
];

describe("screen space: every pair that can clash (docs/PDD.md)", () => {
  for (const p of PAIRS) {
    for (const size of p.sizes) {
      it(`${p.first} then ${p.then} on ${size}: ${p.why}`, () => {
        const { shown } = run(size, OPEN[p.first], OPEN[p.then]);
        for (const [s, want] of Object.entries(p.expect)) expect(shown(s as Surface), s).toBe(want);
      });
    }
  }

  it("covers every pair of surfaces in both orders", () => {
    const surfaces: Surface[] = ["task", "voice", "answer", "line", "menu"];
    for (const a of surfaces) for (const b of surfaces) {
      if (a === b) continue;
      for (const size of ALL) expect(PAIRS.some((p) => p.first === a && p.then === b && p.sizes.includes(size)), `${a} then ${b} on ${size}`).toBe(true);
    }
  });
});

describe("screen space: chips, pills and stepping back", () => {
  it("a menu closing brings the answer back", () => {
    expect(run("phone", OPEN.answer, OPEN.menu, { type: "MENU", on: false }).shown("answer")).toBe("open");
  });

  it("a task ending brings the answer back", () => {
    expect(run("wide", OPEN.answer, OPEN.task, { type: "TASK", on: false }).shown("answer")).toBe("open");
  });

  it("sending a question closes the menu and shows the answer", () => {
    const r = run("phone", OPEN.answer, OPEN.menu, { type: "SEND" });
    expect(r.closeMenu).toHaveBeenCalled();
    expect(r.shown("menu")).toBe("closed");
    expect(r.shown("answer")).toBe("open");
  });

  it("the answer chip opens the answer during a task, until something new opens", () => {
    const r = run("phone", OPEN.answer, OPEN.task, { type: "SHOW_ANSWER" });
    expect(r.shown("answer")).toBe("open");
    expect(run("phone", OPEN.answer, OPEN.task, { type: "SHOW_ANSWER" }, OPEN.menu).shown("answer")).toBe("chip");
  });

  it("a question sent during a task opens its answer instead of folding it at once", () => {
    for (const size of ALL) {
      expect(run(size, OPEN.task, { type: "SEND" }, OPEN.answer).shown("answer")).toBe("open");
      expect(run(size, OPEN.task, { type: "SEND" }, OPEN.answer, OPEN.menu).shown("answer")).toBe("chip");
    }
  });

  it("on a phone the line pill opens the panel beside the answer", () => {
    const r = run("phone", OPEN.answer, OPEN.line, { type: "SHOW_LINE" });
    expect(r.shown("line")).toBe("open");
    expect(r.shown("answer")).toBe("open");
  });

  it("on a small phone the older surface folds: the pill folds the answer, the chip folds the line", () => {
    const pill = run("small", OPEN.answer, OPEN.line, { type: "SHOW_LINE" });
    expect(pill.shown("line")).toBe("open");
    expect(pill.shown("answer")).toBe("chip");
    const chip = run("small", OPEN.answer, OPEN.line, { type: "SHOW_LINE" }, { type: "SHOW_ANSWER" });
    expect(chip.shown("answer")).toBe("open");
    expect(chip.shown("line")).toBe("pill");
  });

  it("turning a phone wide unfolds the line panel", () => {
    expect(run("phone", OPEN.answer, OPEN.line, { type: "SIZE", size: "wide" }).shown("line")).toBe("open");
  });

  it("a new answer folds the line panel again after the pill was tapped", () => {
    const r = run("phone", OPEN.answer, OPEN.line, { type: "SHOW_LINE" }, { type: "ANSWER", on: false }, OPEN.answer);
    expect(r.shown("line")).toBe("pill");
  });

  it("no surface stays without its fact", () => {
    const r = run("phone", OPEN.answer, OPEN.line, { type: "ANSWER", on: false }, { type: "LINE", on: false });
    expect(r.shown("answer")).toBe("closed");
    expect(r.shown("line")).toBe("closed");
  });
});
