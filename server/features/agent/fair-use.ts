/**
 * Fair use for POST /api/agent (#369): a per-client rolling window plus a
 * short burst limit, and a global daily token budget that degrades the agent
 * (cheaper model, then a no-model reply) instead of failing.
 *
 * State lives in this process's memory. The deployment runs one Node process
 * (deploy/docker-compose.yml, one nyc-map-web container), so that is enough;
 * with several processes or replicas each would keep its own counts and the
 * effective limits would multiply. A restart clears everything.
 *
 * No payment, credits or "upgrade" wording anywhere: the limit is about
 * sharing a free service fairly.
 */

export type LimitConfig = {
  /** Questions allowed per rolling window; 0 turns the window off. */
  windowMax: number;
  /** The window is off until this time (epoch ms), e.g. while judges test the app; 0 = always on. */
  windowOffUntil?: number;
  windowMs: number;
  /** Questions allowed per burst period; 0 turns the burst limit off. */
  burstMax: number;
  burstMs: number;
};

export type LimitResult = { ok: true } | { ok: false; retryAt: number; reason: "window" | "burst" };

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : d;
};

/** Judging (3percentclub): no question window for anyone until the end of 26 Oct 2026 in New York; the cooldown stays. */
const JUDGING_ENDS = Date.parse("2026-10-27T00:00:00-04:00");

export function limitConfigFromEnv(env: Record<string, string | undefined> = process.env): LimitConfig {
  const off = env.AGENT_RATE_WINDOW_OFF_UNTIL ? Date.parse(env.AGENT_RATE_WINDOW_OFF_UNTIL) : JUDGING_ENDS;
  return {
    windowMax: num(env.AGENT_RATE_WINDOW_MAX, 20),
    windowOffUntil: Number.isFinite(off) ? off : 0,
    windowMs: num(env.AGENT_RATE_WINDOW_HOURS, 3) * 3_600_000,
    // Always on, against spam: one question per 5 seconds from each address.
    burstMax: num(env.AGENT_RATE_BURST_MAX, 1),
    burstMs: num(env.AGENT_RATE_BURST_SECONDS, 5) * 1000,
  };
}

/** Most keys kept at once; the least recently used are dropped beyond this. */
const MAX_KEYS = 50_000;

/**
 * Each question is a timestamp; it stops counting windowMs after it was asked,
 * so questions free up one at a time rather than all at once.
 */
export function createLimiter(cfg: LimitConfig, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  const keep = Math.max(cfg.windowMs, cfg.burstMs);

  function prune(t: number) {
    for (const [k, list] of hits) {
      if (list.length === 0 || t - list[list.length - 1] >= keep) hits.delete(k);
    }
  }

  return {
    /** Records the question when allowed; a refused question is not counted. */
    take(key: string): LimitResult {
      const t = now();
      const list = (hits.get(key) ?? []).filter((at) => t - at < keep);
      let retryAt = 0;
      let reason: "window" | "burst" = "window";
      if (cfg.windowMax > 0 && t >= (cfg.windowOffUntil ?? 0)) {
        const inWindow = list.filter((at) => t - at < cfg.windowMs);
        if (inWindow.length >= cfg.windowMax) retryAt = inWindow[inWindow.length - cfg.windowMax] + cfg.windowMs;
      }
      if (cfg.burstMax > 0) {
        const inBurst = list.filter((at) => t - at < cfg.burstMs);
        if (inBurst.length >= cfg.burstMax) {
          const at = inBurst[inBurst.length - cfg.burstMax] + cfg.burstMs;
          if (at > retryAt) { retryAt = at; reason = "burst"; }
        }
      }
      hits.delete(key);
      if (retryAt > 0) {
        if (list.length) hits.set(key, list);
        return { ok: false, retryAt, reason };
      }
      list.push(t);
      hits.set(key, list); // re-inserted last, so Map order is least recently used first
      if (hits.size > MAX_KEYS) {
        prune(t);
        while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string);
      }
      return { ok: true };
    },
    size: () => hits.size,
  };
}

export type BudgetConfig = {
  /** Tokens per UTC day before switching to capModel (or straight to no-model when capModel is unset); 0 = no cap. */
  softCap: number;
  /** Tokens per UTC day before no-model replies; 0 = same as softCap. */
  hardCap: number;
  capModel: string | null;
};

export function budgetConfigFromEnv(env: Record<string, string | undefined> = process.env): BudgetConfig {
  return {
    softCap: num(env.AGENT_DAILY_TOKEN_CAP, 3_000_000),
    hardCap: num(env.AGENT_DAILY_TOKEN_HARD_CAP, 4_000_000),
    capModel: env.AGENT_CAP_MODEL?.trim() || null,
  };
}

export type BudgetTier = { tier: "normal" } | { tier: "cheap"; model: string } | { tier: "none"; resetAt: number };

const utcDay = (t: number) => Math.floor(t / 86_400_000);

/** Global (all clients) token spend per UTC day, from the model's reported usage. */
export function createDailyBudget(cfg: BudgetConfig, now: () => number = Date.now) {
  let day = utcDay(now());
  let used = 0;
  const roll = () => {
    const d = utcDay(now());
    if (d !== day) { day = d; used = 0; }
  };
  return {
    record(tokens: number) {
      roll();
      if (Number.isFinite(tokens) && tokens > 0) used += tokens;
    },
    tier(): BudgetTier {
      roll();
      if (cfg.softCap <= 0) return { tier: "normal" };
      const hard = cfg.hardCap > 0 ? Math.max(cfg.hardCap, cfg.softCap) : cfg.softCap;
      const resetAt = (day + 1) * 86_400_000;
      if (used >= hard) return { tier: "none", resetAt };
      if (used >= cfg.softCap) return cfg.capModel ? { tier: "cheap", model: cfg.capModel } : { tier: "none", resetAt };
      return { tier: "normal" };
    },
    used: () => { roll(); return used; },
  };
}

const nyClock = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(t));

function waitWords(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minute${m === 1 ? "" : "s"}` : ""}`;
}

const STILL_WORKS = "The map, live transit, restrooms and the trip panel all keep working in the meantime.";

/** The 429 the client shows as-is. Retry-After is whole seconds, rounded up. */
export function limitedResponse(retryAt: number, reason: "window" | "burst", t: number = Date.now()): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - t) / 1000));
  const lead = reason === "burst" ? "One moment between questions, please." : "You've used your share of assistant questions for now, so everyone gets a turn.";
  const when = retryAfterSeconds < 120 ? `in about ${retryAfterSeconds} seconds` : `in about ${waitWords(retryAt - t)} (around ${nyClock(retryAt)} New York time)`;
  const message = `${lead} Your next question frees up ${when}. ${STILL_WORKS}`;
  return Response.json(
    { error: "rate_limited", message, retryAfterSeconds, retryAt: new Date(retryAt).toISOString() },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" } },
  );
}

/** Spoken-style reply used when the daily budget is spent: no model call at all. */
export function noModelMessage(resetAt: number): string {
  return `The assistant has answered all the questions it can for today, so it is resting until about ${nyClock(resetAt)} New York time. ${STILL_WORKS}`;
}

