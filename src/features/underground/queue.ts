/**
 * "Describe what you see" while there is no signal: the question waits on the
 * device and goes when the connection is back (the online event, plus a
 * retry, since navigator.onLine is often wrong underground and on captive
 * Wi-Fi). Pure, for tests; the component does the storing and sending.
 */

export interface Queued {
  id: string;
  text: string;
  createdAt: number;
  tries: number;
  /** Not before this time (ms). */
  nextAt: number;
}

export const MAX_TRIES = 6;

/** Backoff after a failed send: 15 s, 30 s, 60 s … capped at 5 min. */
export function backoffMs(tries: number): number {
  return Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, tries - 1));
}

export function enqueue(q: Queued[], text: string, now: number, id = `${now}`): Queued[] {
  const t = text.trim();
  if (!t) return q;
  return [...q, { id, text: t, createdAt: now, tries: 0, nextAt: now }];
}

/** The next question to try, when the connection looks up; null when nothing is due. */
export function nextDue(q: Queued[], online: boolean, now: number): Queued | null {
  if (!online) return null;
  return q.find((m) => m.tries < MAX_TRIES && m.nextAt <= now) ?? null;
}

export function markSent(q: Queued[], id: string): Queued[] {
  return q.filter((m) => m.id !== id);
}

export function markFailed(q: Queued[], id: string, now: number): Queued[] {
  return q.map((m) => (m.id === id ? { ...m, tries: m.tries + 1, nextAt: now + backoffMs(m.tries + 1) } : m));
}

/**
 * Connectivity from navigator.onLine plus what our own requests saw: a failed
 * fetch after the last success means offline even when onLine says otherwise.
 */
export function isConnected(p: { navigatorOnLine: boolean; lastOkAt: number | null; lastFailAt: number | null }): boolean {
  if (!p.navigatorOnLine) return false;
  if (p.lastFailAt === null) return true;
  return p.lastOkAt !== null && p.lastOkAt > p.lastFailAt;
}
