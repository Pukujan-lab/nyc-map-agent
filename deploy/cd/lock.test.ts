import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, lockOwner, releaseLock } from "./lock";

let file: string;
const NOW = Date.parse("2026-10-21T12:00:00Z");

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "cd-lock-")), "deploy.lock");
});
afterEach(() => rmSync(join(file, ".."), { recursive: true, force: true }));

describe("deploy lock", () => {
  it("acquires an unheld lock and records the owner", () => {
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
    expect(lockOwner(file)?.at).toBe(NOW);
    expect(lockOwner(file)?.pid).toBe(process.pid);
  });

  it("refuses a second acquire while held", () => {
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
    expect(acquireLock(file, { nowMs: NOW + 1000 })).toBe(false);
    expect(lockOwner(file)?.at).toBe(NOW);
  });

  it("reclaims a stale lock", () => {
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
    expect(acquireLock(file, { nowMs: NOW + 31 * 60 * 1000, staleMs: 30 * 60 * 1000 })).toBe(true);
    expect(lockOwner(file)?.at).toBe(NOW + 31 * 60 * 1000);
  });

  it("releases so the next caller can acquire", () => {
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
    releaseLock(file);
    expect(lockOwner(file)).toBeNull();
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
  });

  it("leaves a lock owned by another process alone", () => {
    writeFileSync(file, JSON.stringify({ pid: process.pid + 1, at: NOW }));
    releaseLock(file);
    expect(lockOwner(file)?.pid).toBe(process.pid + 1);
    expect(acquireLock(file, { nowMs: NOW + 1000 })).toBe(false);
  });

  it("reclaims a lock file with unreadable content", () => {
    writeFileSync(file, "not json");
    expect(acquireLock(file, { nowMs: NOW })).toBe(true);
    expect(lockOwner(file)?.pid).toBe(process.pid);
  });

  it("creates the state directory when it does not exist yet", () => {
    const nested = join(file, "..", "state", "deploy.lock");
    expect(acquireLock(nested, { nowMs: NOW })).toBe(true);
    expect(lockOwner(nested)?.pid).toBe(process.pid);
  });
});
