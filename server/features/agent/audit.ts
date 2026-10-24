/**
 * One request's answer audit (#375): which feeds the tools read and how old
 * they are, and the "no guessing" check on the reply. routes.ts feeds it the
 * stream parts and sends its one "sources" line before "done".
 */
import type { StreamEvent } from "../../../src/features/agent/schema";
import { inventedNumbers, SourceLedger } from "./freshness";

/** Tools that only move the map or find a place: they return no figures a reply may cite. */
export const NON_DATA_TOOLS = new Set(["geocode", "flyTo", "showRoute", "openPanel", "enterStreetView", "playFlythrough", "setTime"]);

export class AnswerAudit {
  readonly ledger = new SourceLedger();
  private reply = "";
  private dataResults = 0;
  private lookups: string[] = [];

  /** `allowed`: text whose numbers the reply may repeat (the user's own messages, the time, the street-view line). */
  constructor(private readonly allowed: string[]) {}

  text(delta: string): void {
    this.reply += delta;
  }

  toolResult(name: string, output: unknown): void {
    if (NON_DATA_TOOLS.has(name)) this.lookups.push(JSON.stringify(output ?? null));
    else this.dataResults += 1;
  }

  /** Figures stated with no data tool result behind them. Empty whenever a data tool returned (see inventedNumbers). */
  unverified(): string[] {
    return this.dataResults ? [] : inventedNumbers(this.reply, [...this.allowed, ...this.lookups]).slice(0, 10);
  }

  /** The "sources" line, or null when there is nothing to say. */
  event(now = Date.now()): Extract<StreamEvent, { type: "sources" }> | null {
    const sources = this.ledger.list(now).slice(0, 12);
    const unverified = this.unverified();
    if (unverified.length) console.warn(`[agent] reply stated ${unverified.length} figure(s) that no data tool returned`);
    return sources.length || unverified.length ? { type: "sources", sources, unverified } : null;
  }
}
