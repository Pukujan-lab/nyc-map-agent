/**
 * Where an answer's data came from and how old it is (#375).
 *
 * Each feed fetch notes its source and the time the data describes (the feed's
 * own timestamp when it has one, else the dataset's last-modified date, else
 * the fetch time). A request-scoped ledger collects the notes, so every tool
 * result and the answer's "sources" line carry them without threading a
 * timestamp through every service function.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { DataSource } from "../../../src/features/agent/schema";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export interface SourceInfo {
  label: string;
  url?: string;
  /** Older than this is shown as stale. */
  staleAfterMs: number;
  /** A limit the answer must not hide. */
  note?: string;
}

/** Every feed the agent's tools read. Also the list the system prompt names. */
export const SOURCE_INFO = {
  "mta-alerts": { label: "MTA service alerts", url: "https://new.mta.info/alerts", staleAfterMs: 2 * MIN },
  // The elevator feed is cached 5 min server-side and updates every few minutes.
  "mta-elevators": { label: "MTA elevator status", url: "https://new.mta.info/elevator-escalator-status", staleAfterMs: 10 * MIN },
  forecast: { label: "Open-Meteo forecast", url: "https://open-meteo.com", staleAfterMs: 3 * 60 * MIN },
  "weather-alerts": { label: "National Weather Service alerts", url: "https://www.weather.gov/okx/", staleAfterMs: 30 * MIN },
  // Irregularly updated: a restroom listed as open may have closed since.
  restrooms: { label: "NYC public restrooms", url: "https://data.cityofnewyork.us/d/i7jb-7jku", staleAfterMs: 180 * DAY, note: "City list; hours and status can be out of date." },
  "traffic-speeds": { label: "DOT traffic speeds", url: "https://data.cityofnewyork.us/d/i4gi-tjb9", staleAfterMs: 15 * MIN },
  "street-closures": { label: "DOT street closures", url: "https://data.cityofnewyork.us/d/i6b5-j7bu", staleAfterMs: 3 * DAY },
  "event-closures": { label: "Permitted events", url: "https://data.cityofnewyork.us/d/tvpp-9vvx", staleAfterMs: 3 * DAY },
  "ny511": { label: "511NY events", url: "https://511ny.org", staleAfterMs: 15 * MIN },
  crashes: { label: "Police-reported crashes, last 12 months", url: "https://data.cityofnewyork.us/d/h9gi-nx95", staleAfterMs: 3 * DAY, note: "Crash data runs weeks to months behind." },
} satisfies Record<string, SourceInfo>;
export type SourceId = keyof typeof SOURCE_INFO;

const toMs = (t: number | string | Date): number | null => {
  const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
};

/** The sources one request (or one tool call) touched, oldest time per source. */
export class SourceLedger {
  private seen = new Map<SourceId, number | null>();
  constructor(private readonly parent?: SourceLedger) {}

  note(id: SourceId, asOf: number | null): void {
    const prev = this.seen.get(id);
    // A known time beats an unknown one; between two times keep the older (the conservative age).
    if (!this.seen.has(id) || (asOf !== null && (prev === null || prev === undefined || asOf < prev))) this.seen.set(id, asOf);
    this.parent?.note(id, asOf);
  }

  list(now = Date.now()): DataSource[] {
    return [...this.seen].map(([id, at]) => {
      const info: SourceInfo = SOURCE_INFO[id];
      return {
        id,
        label: info.label,
        asOf: at === null ? null : new Date(at).toISOString(),
        ...(info.url ? { url: info.url } : {}),
        stale: at !== null && now - at > info.staleAfterMs,
        ...(info.note ? { note: info.note } : {}),
      };
    });
  }
}

const current = new AsyncLocalStorage<SourceLedger>();

/**
 * Note that data from `id` was used. `asOf` is the time the data describes;
 * omit it to mean "fetched just now", pass null when the age is unknown.
 * Outside a request (scripts, tests) this does nothing.
 */
export function noteSource(id: SourceId, asOf?: number | string | Date | null): void {
  const ledger = current.getStore();
  if (!ledger) return;
  ledger.note(id, asOf === undefined ? Date.now() : asOf === null ? null : toMs(asOf));
}

/** Runs `fn` with its own ledger (forwarding to `parent`) and returns what it touched. */
export async function withSources<T>(parent: SourceLedger | undefined, fn: () => Promise<T>): Promise<{ value: T; sources: DataSource[] }> {
  const ledger = new SourceLedger(parent);
  const value = await current.run(ledger, fn);
  return { value, sources: ledger.list() };
}

/* ---------- the "no guessing" check ---------- */

/** Number tokens in text: "1,200" → 1200; ordinals ("44th") and digits inside names ("Q53", "M15") are skipped. */
export function numbersIn(text: string): number[] {
  const tokens = text.replace(/(\d),(\d{3})\b/g, "$1$2").matchAll(/(?<![\p{L}\d.])\d+(?:\.\d+)?(?!\d|(?:st|nd|rd|th)\b)/giu);
  return [...tokens].map((m) => Number(m[0]));
}

/**
 * Figures in a reply that no data tool returned. Reliable only in the narrow
 * case it is used for: when no data tool returned anything this request, any
 * figure the user did not say themselves was made up. When tools did run, a
 * reply may fairly derive numbers ("20 minutes faster"), so this is not run.
 */
export function inventedNumbers(reply: string, allowedTexts: string[]): string[] {
  const allowed = new Set(allowedTexts.flatMap(numbersIn));
  return [...new Set(numbersIn(reply).filter((n) => !allowed.has(n)).map(String))];
}
