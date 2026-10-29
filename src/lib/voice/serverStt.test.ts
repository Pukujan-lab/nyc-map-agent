import { describe, expect, it } from "vitest";
import { SPEECH_RMS, rms, shouldStop } from "./serverStt";

describe("recording one voice turn", () => {
  it("measures loudness", () => {
    expect(rms([0, 0, 0])).toBe(0);
    expect(rms([0.5, -0.5])).toBeCloseTo(0.5);
    expect(rms([0.001, -0.001])).toBeLessThan(SPEECH_RMS);
  });
  it("ends after a pause once someone spoke, waits for a first word, and caps the length", () => {
    const base = { started: 0, endMs: 1300, waitMs: 6000, maxMs: 20_000 };
    expect(shouldStop({ ...base, now: 2000, lastSpeech: 1500 })).toBeNull();
    expect(shouldStop({ ...base, now: 3000, lastSpeech: 1500 })).toBe("silence");
    expect(shouldStop({ ...base, now: 5000, lastSpeech: null })).toBeNull();
    expect(shouldStop({ ...base, now: 6000, lastSpeech: null })).toBe("no-speech");
    expect(shouldStop({ ...base, now: 20_000, lastSpeech: 19_900 })).toBe("max");
  });
});
