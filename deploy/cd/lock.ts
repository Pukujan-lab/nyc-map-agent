import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LockOwner {
  pid: number;
  at: number;
}

export function lockOwner(dir: string): LockOwner | null {
  const file = join(dir, "owner");
  if (!existsSync(file)) return null;
  try {
    const owner = JSON.parse(readFileSync(file, "utf8")) as LockOwner;
    return typeof owner.at === "number" ? owner : null;
  } catch {
    return null;
  }
}

/** `mkdir` is atomic, so the directory itself is the lock. */
export function acquireLock(dir: string, opts: { nowMs?: number; staleMs?: number } = {}): boolean {
  const nowMs = opts.nowMs ?? Date.now();
  const staleMs = opts.staleMs ?? 30 * 60 * 1000;
  // The state directory does not exist on a fresh host; creating it here keeps
  // the first deploy from failing every acquire with ENOENT.
  mkdirSync(dirname(dir), { recursive: true });
  try {
    mkdirSync(dir);
    writeFileSync(join(dir, "owner"), JSON.stringify({ pid: process.pid, at: nowMs }));
    return true;
  } catch {
    const owner = lockOwner(dir);
    // An owner file with no timestamp, or a lock older than staleMs, is dead.
    if (!owner || nowMs - owner.at > staleMs) {
      rmSync(dir, { recursive: true, force: true });
      try {
        mkdirSync(dir);
        writeFileSync(join(dir, "owner"), JSON.stringify({ pid: process.pid, at: nowMs }));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function releaseLock(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
