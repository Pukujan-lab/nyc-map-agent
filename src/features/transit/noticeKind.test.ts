import { describe, expect, it } from "vitest";
import { noticeKind } from "./noticeKind";

describe("notice kinds for one-line rows", () => {
  it("reads what happens from the notice's own words", () => {
    expect(noticeKind("Escalator out at Grand Central-42 St")).toBe("elevator");
    expect(noticeKind("Delays while crews fix a signal problem at 42 St")).toBe("repair");
    expect(noticeKind("In Queens, Flushing-bound 7 skips 52 St and 69 St")).toBe("skip");
    expect(noticeKind("In Queens, no [7] at Flushing-Main St")).toBe("noService");
    expect(noticeKind("Trains are running with delays", { kind: "delay" })).toBe("delay");
    expect(noticeKind("F trains run via the E", { reroute: true })).toBe("detour");
    expect(noticeKind("Weekend work on the A", { kind: "planned" })).toBe("planned");
    expect(noticeKind("Service update")).toBe("info");
  });
});
