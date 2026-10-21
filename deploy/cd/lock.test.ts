import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, lockOwner, releaseLock } from "./lock";

let dir: string;
const NOW = Date.parse("2026-10-21T12:00:00Z");

beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "cd-lock-")), "deploy.lock");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

describe("deploy lock", () => {
  it("acquires an unheld lock and records the owner", () => {
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
    expect(lockOwner(dir)?.at).toBe(NOW);
    expect(lockOwner(dir)?.pid).toBe(process.pid);
  });

  it("refuses a second acquire while held", () => {
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
    expect(acquireLock(dir, { nowMs: NOW + 1000 })).toBe(false);
    expect(lockOwner(dir)?.at).toBe(NOW);
  });

  it("reclaims a stale lock", () => {
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
    expect(acquireLock(dir, { nowMs: NOW + 31 * 60 * 1000, staleMs: 30 * 60 * 1000 })).toBe(true);
    expect(lockOwner(dir)?.at).toBe(NOW + 31 * 60 * 1000);
  });

  it("releases so the next caller can acquire", () => {
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
    releaseLock(dir);
    expect(lockOwner(dir)).toBeNull();
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
  });

  it("leaves a lock owned by another process alone", () => {
    writeFileSync(dir, JSON.stringify({ pid: process.pid + 1, at: NOW }));
    releaseLock(dir);
    expect(lockOwner(dir)?.pid).toBe(process.pid + 1);
    expect(acquireLock(dir, { nowMs: NOW + 1000 })).toBe(false);
  });

  it("reclaims a lock file whose content is unreadable", () => {
    writeFileSync(dir, "not json");
    expect(acquireLock(dir, { nowMs: NOW })).toBe(true);
    expect(lockOwner(dir)?.pid).toBe(process.pid);
  });

  it("creates the state directory when it does not exist yet", () => {
    const nested = join(dir, "..", "state", "deploy.lock");
    expect(acquireLock(nested, { nowMs: NOW })).toBe(true);
    expect(lockOwner(nested)?.pid).toBe(process.pid);
  });
});
