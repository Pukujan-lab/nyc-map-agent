import { describe, expect, it } from "vitest";
import { nextFold } from "./answerFold";

describe("nextFold", () => {
  it("folds for a menu and comes back when it closes", () => {
    const open = nextFold(null, { menuOpen: true, taskStarted: false });
    expect(open).toBe("menu");
    expect(nextFold(open, { menuOpen: false, taskStarted: false })).toBeNull();
  });

  it("stays folded after a task starts, even once a menu closes", () => {
    const task = nextFold(null, { menuOpen: false, taskStarted: true });
    expect(task).toBe("task");
    expect(nextFold(nextFold(task, { menuOpen: true, taskStarted: false }), { menuOpen: false, taskStarted: false })).toBe("task");
  });

  it("a task starting under a menu fold keeps the answer folded for the task", () => {
    expect(nextFold("menu", { menuOpen: true, taskStarted: true })).toBe("task");
  });
});
