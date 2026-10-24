import { Clock, TriangleAlert } from "lucide-react";
import type { DataSource, StreamEvent } from "./schema";

export type AnswerSourcesLine = Pick<Extract<StreamEvent, { type: "sources" }>, "sources" | "unverified">;

/** "40 s ago", "3 min ago", "5 h ago", "2 days ago", else the month ("Jun 2025"). */
export function ageText(asOf: string | null, now = Date.now()): string {
  if (!asOf) return "update time unknown";
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return "update time unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `updated ${s} s ago`;
  if (s < 3600) return `updated ${Math.round(s / 60)} min ago`;
  if (s < 48 * 3600) return `updated ${Math.round(s / 3600)} h ago`;
  if (s < 60 * 86400) return `updated ${Math.round(s / 86400)} days ago`;
  return `updated ${new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" })}`;
}

function Source({ s, now }: { s: DataSource; now: number }) {
  const label = s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">{s.label}</a> : s.label;
  return (
    <span className={s.stale ? "text-amber-700 dark:text-amber-400" : undefined}>
      {label}, {ageText(s.asOf, now)}
      {s.stale ? " (may be out of date)" : ""}
      {s.note ? `. ${s.note}` : ""}
    </span>
  );
}

/** The small "Sources · updated 40 s ago" line under an answer (#375). Built by the server from the feeds it read. */
export function AnswerSources({ line, now = Date.now() }: { line: AnswerSourcesLine; now?: number }) {
  if (!line.sources.length && !line.unverified.length) return null;
  return (
    <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-muted-foreground" data-testid="answer-sources">
      {line.sources.length ? (
        <div className="flex gap-1">
          <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-medium">Sources</span>
            {line.sources.map((s) => (
              <span key={s.id}> · <Source s={s} now={now} /></span>
            ))}
          </div>
        </div>
      ) : null}
      {line.unverified.length ? (
        <div className="flex gap-1 text-amber-700 dark:text-amber-400" role="note">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>No data source backs the figures in this answer ({line.unverified.join(", ")}). Treat them as unverified.</span>
        </div>
      ) : null}
    </div>
  );
}
