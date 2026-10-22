import { describe, expect, it } from "vitest";
import { checkBearer, checkPassword, createRateLimiter, signSession, verifySession } from "./auth";

const SECRET = "s".repeat(32);
const NOW = Date.parse("2026-10-21T12:00:00Z");

describe("session cookies", () => {
  it("round-trips a valid session", () => {
    const cookie = signSession(SECRET, NOW + 60_000);
    expect(verifySession(SECRET, cookie, NOW)).toBe(true);
  });

  it("rejects a tampered expiry", () => {
    const cookie = signSession(SECRET, NOW + 60_000);
    const [, sig] = cookie.split(".");
    expect(verifySession(SECRET, `${NOW + 600_000}.${sig}`, NOW)).toBe(false);
  });

  it("rejects an expired session", () => {
    expect(verifySession(SECRET, signSession(SECRET, NOW - 1), NOW)).toBe(false);
  });

  it("rejects a cookie signed with another key", () => {
    expect(verifySession("x".repeat(32), signSession(SECRET, NOW + 60_000), NOW)).toBe(false);
  });

  it("rejects missing and malformed cookies", () => {
    expect(verifySession(SECRET, undefined, NOW)).toBe(false);
    expect(verifySession(SECRET, "garbage", NOW)).toBe(false);
    expect(verifySession(SECRET, ".", NOW)).toBe(false);
  });
});

describe("password and bearer comparison", () => {
  it("accepts the right password and rejects the wrong one", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter3", "hunter2")).toBe(false);
    expect(checkPassword("", "hunter2")).toBe(false);
  });

  it("does not throw on length mismatch", () => {
    expect(checkPassword("a", "a much longer password")).toBe(false);
  });

  it("accepts a bearer token and rejects malformed headers", () => {
    expect(checkBearer("Bearer abc123", "abc123")).toBe(true);
    expect(checkBearer("Bearer abc124", "abc123")).toBe(false);
    expect(checkBearer("Basic abc123", "abc123")).toBe(false);
    expect(checkBearer(undefined, "abc123")).toBe(false);
  });
});

describe("login rate limiter", () => {
  it("blocks after five failures and forgets them after the window", () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) limiter.record("1.2.3.4", NOW);
    expect(limiter.blocked("1.2.3.4", NOW)).toBe(true);
    expect(limiter.blocked("1.2.3.4", NOW + 60_001)).toBe(false);
  });

  it("tracks addresses separately", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    limiter.record("a", NOW);
    expect(limiter.blocked("a", NOW)).toBe(true);
    expect(limiter.blocked("b", NOW)).toBe(false);
  });
});
