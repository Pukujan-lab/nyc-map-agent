/**
 * The server allows one question per few seconds from each address
 * (server/features/agent/fair-use.ts, burst limit). The chat waits that gap out
 * instead of showing the refusal: a question asked too soon is held and sent
 * when the gap ends. The server limit stays as the safety net.
 */

/** Same as the server's default burst gap (AGENT_RATE_BURST_SECONDS = 5). */
export const QUESTION_GAP_MS = 5_000;

/** A refusal that frees up within this long is waited out and retried; longer ones are shown. */
export const RETRY_WITHIN_S = 15;

let lastAskAt = -Infinity;

/** How long until the next question may go, given when the last one went. */
export function gapLeft(now: number, last: number = lastAskAt, gap: number = QUESTION_GAP_MS): number {
  return Math.max(0, last + gap - now);
}

export function markAsked(now: number = Date.now()): void {
  lastAskAt = now;
}

/** For tests. */
export function resetSpacing(): void {
  lastAskAt = -Infinity;
}

/** Resolves true after ms, or false as soon as the signal aborts (a newer question replaced this one). */
export function waitFor(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(ok);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    signal?.addEventListener("abort", onAbort);
  });
}
