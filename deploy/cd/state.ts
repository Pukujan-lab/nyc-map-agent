import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Run } from "./types";

/** Appends one JSON line per run record. Later records for the same id win. */
export function appendRun(file: string, run: Run): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(run)}\n`);
}

export function readRuns(file: string, limit = 20): Run[] {
  if (!existsSync(file)) return [];
  const byId = new Map<string, Run>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const run = JSON.parse(line) as Run;
      if (run && typeof run.id === "string") byId.set(run.id, run);
    } catch {
      // A truncated line from a killed process; the next record still reads.
    }
  }
  return [...byId.values()]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
    .slice(0, limit);
}

export function currentRun(file: string): Run | null {
  return readRuns(file, Number.MAX_SAFE_INTEGER).find((r) => r.status === "succeeded" || r.status === "rolled-back") ?? null;
}

/** A run left `running` by a killed CD container is closed on the next start. */
export function markInterrupted(file: string, now = new Date()): number {
  const open = readRuns(file, Number.MAX_SAFE_INTEGER).filter((r) => r.status === "running");
  for (const run of open) {
    appendRun(file, {
      ...run,
      status: "interrupted",
      finishedAt: now.toISOString(),
      durationMs: now.getTime() - Date.parse(run.startedAt),
      error: "the deploy server restarted mid-run",
    });
  }
  return open.length;
}
