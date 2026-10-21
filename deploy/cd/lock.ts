import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LockOwner {
  pid: number;
  at: number;
}

export function lockOwner(file: string): LockOwner | null {
  try {
    const owner = JSON.parse(readFileSync(file, "utf8")) as LockOwner;
    return typeof owner.at === "number" && typeof owner.pid === "number" ? owner : null;
  } catch {
    return null;
  }
}

/**
 * `link` publishes a file whose content is already written, so no reader can
 * ever observe a lock that exists but has no owner. The path is the lock.
 */
export function acquireLock(file: string, opts: { nowMs?: number; staleMs?: number } = {}): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  const staleMs = opts.staleMs ?? 30 * 60 * 1000;
  // The state directory does not exist on a fresh host; creating it here keeps
  // the first deploy from failing every acquire with ENOENT.
  mkdirSync(dirname(file), { recursive: true });

  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ pid: process.pid, at: nowMs }));
  try {
    try {
      linkSync(tmp, file);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const owner = lockOwner(file);
    if (owner && nowMs - owner.at < staleMs) return false;
    rmSync(file, { force: true });
    try {
      linkSync(tmp, file);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      return false;
    }
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Removes the lock only when this process owns it. */
export function releaseLock(file: string): void {
  if (lockOwner(file)?.pid !== process.pid) return;
  rmSync(file, { force: true });
}
