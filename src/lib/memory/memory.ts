import { useSyncExternalStore } from "react";

/**
 * "What we remember" (#370): what the app learns about the person, kept only
 * in this browser's localStorage. Each kind has a switch; turning one off
 * stops recording that kind and clears what was kept. Nothing here is sent
 * anywhere; the agent gets at most a one-line summary built from it.
 */
export type MemoryKind = "rides" | "homeWork" | "chats" | "trips" | "exactLocation";

/** Storage keys. The Home/Work and commute keys are the ones the daily card already reads. */
export const HOME_WORK_KEY = "nma.homeWork";
export const COMMUTE_KEY = "nma.commute";
export const LOOKED_UP_KEY = "nma.lookedUp";
export const CHATS_KEY = "nma.chats";
const PREFS_KEY = "nma.memory";
/** Fired on window when kept data changes, so readers re-read. */
export const MEMORY_CHANGED = "nma:memory";

/** Which keys hold each kind; exact location is a rule on the others, not a store of its own. */
const KEYS: Record<MemoryKind, string[]> = {
  rides: [COMMUTE_KEY],
  homeWork: [HOME_WORK_KEY],
  chats: [CHATS_KEY],
  trips: [LOOKED_UP_KEY],
  exactLocation: [],
};

export const MEMORY_KINDS: MemoryKind[] = ["rides", "homeWork", "chats", "trips", "exactLocation"];
const DEFAULTS: Record<MemoryKind, boolean> = { rides: true, homeWork: true, chats: true, trips: true, exactLocation: false };

/** Kept chats older than this are dropped. */
const CHAT_DAYS = 30;
const MAX_CHATS = 30;
const MAX_LOOKED_UP = 5;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

function readPrefs(storage: Pick<Storage, "getItem"> | undefined = local()): Record<MemoryKind, boolean> {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? "{}") as Partial<Record<MemoryKind, unknown>>;
    const out = { ...DEFAULTS };
    for (const k of MEMORY_KINDS) if (typeof raw[k] === "boolean") out[k] = raw[k];
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs = readPrefs();
const subs = new Set<() => void>();
const notify = () => {
  subs.forEach((f) => f());
  try {
    window.dispatchEvent(new Event(MEMORY_CHANGED));
  } catch {
    /* no window (tests) */
  }
};

/** Whether the app may keep this kind of memory. */
export const remembers = (kind: MemoryKind): boolean => prefs[kind];

export function useMemoryPrefs(): Record<MemoryKind, boolean> {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => prefs, () => prefs);
}

function clearKind(kind: MemoryKind, storage: Store | undefined): void {
  for (const k of KEYS[kind]) {
    try {
      storage?.removeItem(k);
    } catch {
      /* private mode */
    }
  }
  // Exact location off: looked-up trips keep their place names, not their coordinates.
  if (kind === "exactLocation") writeLookedUp(readLookedUp(storage).map(({ from, to, ...t }) => ({ ...t, from: { label: from.label }, to: { label: to.label } })), storage);
}

/** Turn one kind on or off. Off stops recording it and clears what was kept. */
export function setRemembering(kind: MemoryKind, on: boolean, storage: Store | undefined = local()): void {
  prefs = { ...prefs, [kind]: on };
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
  if (!on) clearKind(kind, storage);
  notify();
}

/** Delete everything: every kind's data. The switches keep their positions. */
export function forgetEverything(storage: Store | undefined = local()): void {
  for (const k of MEMORY_KINDS) clearKind(k, storage);
  notify();
}

// ---- Trips looked up ----

interface LookedUpEnd {
  label: string;
  /** Only while Exact location is on. */
  at?: [number, number];
}
export interface LookedUp {
  from: LookedUpEnd;
  to: LookedUpEnd;
  /** Lines ridden, for the bullets. */
  routes: string[];
  mode: "walk" | "transit" | "drive";
  /** When it was looked up, ms since epoch. */
  t: number;
}

const isEnd = (v: unknown): v is LookedUpEnd => !!v && typeof v === "object" && typeof (v as LookedUpEnd).label === "string";

export function readLookedUp(storage: Pick<Storage, "getItem"> | undefined = local()): LookedUp[] {
  try {
    const raw = JSON.parse(storage?.getItem(LOOKED_UP_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is LookedUp => !!x && typeof x === "object" && isEnd((x as LookedUp).from) && isEnd((x as LookedUp).to) && typeof (x as LookedUp).t === "number")
      .map((x) => ({ ...x, routes: Array.isArray(x.routes) ? x.routes.filter((r) => typeof r === "string") : [], mode: x.mode === "walk" || x.mode === "drive" ? x.mode : ("transit" as const) }))
      .slice(0, MAX_LOOKED_UP);
  } catch {
    return [];
  }
}

function writeLookedUp(list: LookedUp[], storage: Store | undefined): void {
  try {
    if (list.length) storage?.setItem(LOOKED_UP_KEY, JSON.stringify(list.slice(0, MAX_LOOKED_UP)));
    else storage?.removeItem(LOOKED_UP_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Save a place as Home or Work (#313), in the shape the daily card reads. Returns false when
 * Home & Work is switched off in What we remember, so nothing is kept.
 */
export function saveHomeWork(which: "home" | "work", spot: { label: string; lon: number; lat: number }, storage: Store | undefined = local()): boolean {
  if (!remembers("homeWork") || !storage) return false;
  let saved: Record<string, unknown> = {};
  try {
    const v = JSON.parse(storage.getItem(HOME_WORK_KEY) ?? "{}") as unknown;
    if (v && typeof v === "object") saved = v as Record<string, unknown>;
  } catch {
    /* unreadable: start fresh */
  }
  try {
    storage.setItem(HOME_WORK_KEY, JSON.stringify({ ...saved, [which]: { label: spot.label.trim().slice(0, 80), lon: spot.lon, lat: spot.lat } }));
  } catch {
    return false;
  }
  notify();
  return true;
}

/** Keep a planned trip, newest first, at most five; the same trip again moves to the top. */
export function rememberLookup(trip: Omit<LookedUp, "t">, now = Date.now(), storage: Store | undefined = local()): void {
  if (!remembers("trips")) return;
  const exact = remembers("exactLocation");
  const end = (e: LookedUpEnd): LookedUpEnd => (exact && e.at ? { label: e.label, at: e.at } : { label: e.label });
  const entry: LookedUp = { ...trip, from: end(trip.from), to: end(trip.to), t: now };
  const same = (x: LookedUp) => x.from.label === entry.from.label && x.to.label === entry.to.label;
  writeLookedUp([entry, ...readLookedUp(storage).filter((x) => !same(x))], storage);
  notify();
}

export function useLookedUp(): LookedUp[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      window.addEventListener("storage", f);
      return () => { subs.delete(f); window.removeEventListener("storage", f); };
    },
    () => lookedUpSnapshot(),
    () => lookedUpSnapshot(),
  );
}
// useSyncExternalStore needs a stable snapshot: re-parse only when the stored string changes.
let lastRaw: string | null | undefined;
let lastList: LookedUp[] = [];
function lookedUpSnapshot(): LookedUp[] {
  let raw: string | null = null;
  try {
    raw = local()?.getItem(LOOKED_UP_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastList = readLookedUp();
  }
  return lastList;
}

// ---- Chats ----

interface KeptChat {
  q: string;
  t: number;
}

export function readChats(now = Date.now(), storage: Pick<Storage, "getItem"> | undefined = local()): KeptChat[] {
  try {
    const raw = JSON.parse(storage?.getItem(CHATS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    const cutoff = now - CHAT_DAYS * 86_400_000;
    return raw.filter((x): x is KeptChat => !!x && typeof x === "object" && typeof (x as KeptChat).q === "string" && typeof (x as KeptChat).t === "number" && (x as KeptChat).t >= cutoff);
  } catch {
    return [];
  }
}

/** Keep a question the person asked, for 30 days, while Chats is on. */
export function rememberChat(q: string, now = Date.now(), storage: Store | undefined = local()): void {
  if (!remembers("chats") || !q.trim()) return;
  try {
    storage?.setItem(CHATS_KEY, JSON.stringify([{ q: q.trim().slice(0, 300), t: now }, ...readChats(now, storage)].slice(0, MAX_CHATS)));
  } catch {
    /* private mode */
  }
}

// ---- See all ----

export interface StoredItem {
  kind: MemoryKind;
  text: string;
}

/** A plain list of what is kept, for "See all". */
export function listStored(now = Date.now(), storage: Pick<Storage, "getItem"> | undefined = local()): StoredItem[] {
  const out: StoredItem[] = [];
  const json = (k: string): Record<string, unknown> => {
    try {
      const v = JSON.parse(storage?.getItem(k) ?? "{}") as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const commute = json(COMMUTE_KEY);
  for (const dir of ["work", "home"] as const) {
    const r = commute[dir] as { route?: unknown; board?: unknown } | undefined;
    if (r && typeof r.route === "string") out.push({ kind: "rides", text: `To ${dir === "work" ? "Work" : "Home"}: the ${r.route}${typeof r.board === "string" ? ` from ${r.board}` : ""}` });
  }
  const hw = json(HOME_WORK_KEY);
  for (const [k, name] of [["home", "Home"], ["work", "Work"]] as const) {
    const s = hw[k] as { label?: unknown } | undefined;
    if (s && typeof s.label === "string") out.push({ kind: "homeWork", text: `${name}: ${s.label}` });
  }
  for (const c of readChats(now, storage)) out.push({ kind: "chats", text: `Asked: ${c.q}` });
  for (const t of readLookedUp(storage)) out.push({ kind: "trips", text: `Looked up: ${t.from.label} to ${t.to.label}${t.from.at || t.to.at ? " (exact points)" : ""}` });
  return out;
}

/** How many kinds are still being kept. Exact location starts off, so the usual count is 4 of 5. */
export function rememberedCount(prefs: Record<MemoryKind, boolean>): number {
  return MEMORY_KINDS.reduce((n, k) => n + (prefs[k] ? 1 : 0), 0);
}

export const MEMORY_LABELS: Record<MemoryKind, string> = {
  rides: "Daily rides",
  homeWork: "Home & Work",
  chats: "Chats · 30 days",
  trips: "Trips looked up",
  exactLocation: "Exact location",
};
