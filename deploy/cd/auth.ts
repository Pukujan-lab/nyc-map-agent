import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "nyc_cd_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sessionExpiry(nowMs = Date.now()): number {
  return nowMs + SESSION_TTL_MS;
}

export function signSession(secret: string, expMs: number): string {
  const payload = String(expMs);
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(secret: string, cookie: string | undefined, nowMs = Date.now()): boolean {
  if (!cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [payload, sig] = parts;
  const expected = Buffer.from(hmac(secret, payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > nowMs;
}

/** Compares SHA-256 digests so differing input lengths never throw. */
export function checkPassword(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function checkBearer(header: string | undefined, token: string): boolean {
  const match = header?.match(/^Bearer (.+)$/);
  return match ? checkPassword(match[1], token) : false;
}

export interface RateLimiter {
  blocked(ip: string, nowMs?: number): boolean;
  record(ip: string, nowMs?: number): void;
}

export function createRateLimiter(opts: { max?: number; windowMs?: number } = {}): RateLimiter {
  const max = opts.max ?? 5;
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const hits = new Map<string, number[]>();
  const recent = (ip: string, nowMs: number) => (hits.get(ip) ?? []).filter((t) => nowMs - t < windowMs);
  return {
    blocked(ip, nowMs = Date.now()) {
      const arr = recent(ip, nowMs);
      hits.set(ip, arr);
      return arr.length >= max;
    },
    record(ip, nowMs = Date.now()) {
      hits.set(ip, [...recent(ip, nowMs), nowMs]);
    },
  };
}
