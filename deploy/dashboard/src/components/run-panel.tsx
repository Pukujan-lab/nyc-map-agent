import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogPane } from "@/components/log-pane";
import { RunStatusPill } from "@/components/status-pill";
import { StepStepper } from "@/components/step-stepper";
import {
  elapsedMs,
  formatAbsolute,
  formatDuration,
  formatRelative,
  shortSha,
} from "@/lib/format";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RunPanelProps {
  run: Run;
  live: boolean;
  now: number;
  onClose?: () => void;
  onFinished?: () => void;
  className?: string;
}

export function RunPanel({
  run,
  live,
  now,
  onClose,
  onFinished,
  className,
}: RunPanelProps) {
  const elapsed = live
    ? elapsedMs(run.startedAt, run.finishedAt, now)
    : run.durationMs;

  return (
    <Card className={cn("overflow-hidden bg-card/80", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {live ? "Deploy in progress" : "Run detail"}
            </span>
            <RunStatusPill status={run.status} />
          </div>
          <div className="mt-1 break-all font-mono text-xs text-slate-200 sm:text-sm">
            {run.id}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            <span className="text-slate-300">{shortSha(run.sha)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span title={formatAbsolute(run.startedAt)}>
              started {formatRelative(run.startedAt, now)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="font-mono text-lg leading-none tabular-nums text-slate-100">
              {formatDuration(elapsed)}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {live ? "elapsed" : "duration"}
            </div>
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-1 size-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close run detail"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <StepStepper steps={run.steps} />
        <LogPane runId={run.id} onFinished={onFinished} />
        {run.error ? (
          <div className="whitespace-pre-wrap rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">
            {run.error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
