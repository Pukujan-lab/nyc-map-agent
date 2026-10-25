import { describe, expect, it } from "vitest";
import { MAX_PARTICLES, particleCount } from "./precipCanvas";

describe("particleCount", () => {
  it("never exceeds the cap, even on huge screens at full intensity", () => {
    expect(particleCount(1, 3840, 2160)).toBe(MAX_PARTICLES);
    expect(particleCount(5, 1280, 800)).toBe(MAX_PARTICLES);
  });

  it("scales with intensity and draws nothing at zero", () => {
    expect(particleCount(0, 1280, 800)).toBe(0);
    expect(particleCount(0.5, 1280, 800)).toBe(MAX_PARTICLES / 2);
  });

  it("thins out on a phone but keeps a visible floor", () => {
    const phone = particleCount(1, 390, 844);
    expect(phone).toBeLessThan(MAX_PARTICLES);
    expect(phone).toBeGreaterThanOrEqual(Math.round(MAX_PARTICLES * 0.35));
  });
});
