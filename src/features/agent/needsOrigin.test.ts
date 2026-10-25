import { describe, expect, it } from "vitest";
import { needsSharedOrigin, replyAsksForOrigin } from "./needsOrigin";

describe("needsSharedOrigin", () => {
  it("catches a trip that starts from here", () => {
    expect(needsSharedOrigin("How will my trip be tomorrow from here to Grand Central at 9am?")).toBe(true);
    expect(needsSharedOrigin("how do i get from my place to rockaway beach")).toBe(true);
    expect(needsSharedOrigin("what's near where I am")).toBe(true);
  });

  it("leaves a named start alone", () => {
    expect(needsSharedOrigin("Walk me from Union Square to Washington Square Park")).toBe(false);
    expect(needsSharedOrigin("how do i get from union square to rockaway beach")).toBe(false);
  });
});

describe("replyAsksForOrigin", () => {
  it("catches the assistant asking for a start", () => {
    expect(replyAsksForOrigin("I don't know where you're starting from yet. Tap Use my location.")).toBe(true);
    expect(replyAsksForOrigin("Take the 4 and use the NW exit.")).toBe(false);
    expect(replyAsksForOrigin("我需要知道你在哪儿才能找最近的厕所——请点下面的“使用我的位置”，或告诉我一个起始地址。")).toBe(true);
    expect(replyAsksForOrigin("Toca Usar mi ubicación o escribe una dirección.")).toBe(true);
    expect(replyAsksForOrigin("Tome le 4 et sortez au nord-ouest.")).toBe(false);
  });
});
