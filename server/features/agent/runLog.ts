/**
 * Timing for one /api/agent request: when the first step and the first words came,
 * how long each tool took, which model answered and how it ended. Written as one
 * "[agent-run]" JSON log line and one core.agent_runs row (migration 20261024010000).
 * A request still running after STUCK_MS is written as "stuck" straight away, so a
 * hang shows up even if it never finishes. Never records the question, the answer
 * or a location.
 */
import { randomUUID } from "node:crypto";
import { octoQuery } from "../../../api/_lib/octo";

const STUCK_MS = 45_000;

type RunOutcome = "done" | "error" | "stuck" | "aborted";
interface RunStep { name: string; ms: number; status: "done" | "error" | "running" }
export interface RunRecord {
  id: string;
  startedAt: string;
  model: string;
  outcome: RunOutcome;
  firstStepMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
  steps: RunStep[];
  notes: string[];
  inputTokens: number | null;
  outputTokens: number | null;
}

type Write = (r: RunRecord) => Promise<void>;

/** Upsert into core.agent_runs, dropping rows older than 30 days now and then. */
const writeRun: Write = async (r) => {
  if (!process.env.OCTO_API_KEY || !process.env.OCTO_WORKSPACE_ID) return;
  await octoQuery(
    `INSERT INTO core.agent_runs (id, started_at, model, outcome, first_step_ms, first_text_ms, total_ms, steps, notes, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
     ON CONFLICT (id) DO UPDATE SET model = EXCLUDED.model, outcome = EXCLUDED.outcome, first_step_ms = EXCLUDED.first_step_ms,
       first_text_ms = EXCLUDED.first_text_ms, total_ms = EXCLUDED.total_ms, steps = EXCLUDED.steps, notes = EXCLUDED.notes,
       input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens`,
    [r.id, r.startedAt, r.model, r.outcome, r.firstStepMs, r.firstTextMs, r.totalMs, JSON.stringify(r.steps), JSON.stringify(r.notes), r.inputTokens, r.outputTokens],
    { rowLimit: 1 },
  );
  if (Math.random() < 0.02) await octoQuery("DELETE FROM core.agent_runs WHERE started_at < now() - interval '30 days'", [], { rowLimit: 1 });
};

export class RunLog {
  readonly id = randomUUID();
  private readonly started: number;
  private firstStep: number | null = null;
  private firstText: number | null = null;
  private readonly open = new Map<string, { name: string; at: number }>();
  private readonly steps: RunStep[] = [];
  private readonly notes: string[] = [];
  private ended = false;
  private readonly stuckTimer: ReturnType<typeof setTimeout>;

  constructor(
    private model: string,
    private readonly write: Write = writeRun,
    private readonly now: () => number = Date.now,
    private readonly log: (line: string) => void = console.log,
    stuckMs = STUCK_MS,
  ) {
    this.started = now();
    this.stuckTimer = setTimeout(() => this.emit("stuck", null), stuckMs);
    this.stuckTimer.unref?.();
  }

  stepStart(id: string, name: string): void {
    const at = this.now();
    this.firstStep ??= at - this.started;
    this.open.set(id, { name, at });
  }

  stepEnd(id: string, ok: boolean): void {
    const s = this.open.get(id);
    if (!s) return;
    this.open.delete(id);
    this.steps.push({ name: s.name, ms: this.now() - s.at, status: ok ? "done" : "error" });
  }

  text(): void {
    this.firstText ??= this.now() - this.started;
  }

  /** A model fallback or slow start; the message names models only. */
  note(message: string): void {
    this.notes.push(message.slice(0, 200));
  }

  usedModel(model: string): void {
    this.model = model;
  }

  finish(outcome: Exclude<RunOutcome, "stuck">, usage: { inputTokens: number; outputTokens: number } | null): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.stuckTimer);
    this.emit(outcome, usage);
  }

  record(outcome: RunOutcome, usage: { inputTokens: number; outputTokens: number } | null): RunRecord {
    const now = this.now();
    const running: RunStep[] = [...this.open.values()].map((s) => ({ name: s.name, ms: now - s.at, status: "running" }));
    return {
      id: this.id,
      startedAt: new Date(this.started).toISOString(),
      model: this.model,
      outcome,
      firstStepMs: this.firstStep,
      firstTextMs: this.firstText,
      totalMs: now - this.started,
      steps: [...this.steps, ...running],
      notes: [...this.notes],
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    };
  }

  private emit(outcome: RunOutcome, usage: { inputTokens: number; outputTokens: number } | null): void {
    const r = this.record(outcome, usage);
    this.log(`[agent-run] ${JSON.stringify(r)}`);
    this.write(r).catch((e: unknown) => console.warn(`[agent-run] could not save run ${r.id}: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`));
  }
}
