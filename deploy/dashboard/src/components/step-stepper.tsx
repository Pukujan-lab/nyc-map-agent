import type { Step, StepName } from "@/lib/types";
import { STEP_NAMES } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stepCardClass, stepDotClass, stepTextClass } from "@/components/status-pill";

function stepDuration(step: Step): string | null {
  if (!step.startedAt || !step.finishedAt) return null;
  return formatDuration(
    new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime(),
  );
}

export function StepStepper({ steps }: { steps: Step[] }) {
  const byName = new Map<StepName, Step>();
  steps.forEach((step) => byName.set(step.name, step));

  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
      {STEP_NAMES.map((name) => {
        const step: Step = byName.get(name) ?? {
          name,
          status: "pending",
          startedAt: null,
          finishedAt: null,
        };
        const duration = stepDuration(step);
        return (
          <div
            key={name}
            className={cn(
              "min-w-0 rounded-md border bg-background/40 px-1 py-1.5 sm:px-2",
              stepCardClass(step.status),
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "hidden size-1.5 shrink-0 rounded-full sm:inline-block",
                  stepDotClass(step.status),
                  step.status === "running" && "animate-pulse",
                )}
              />
              <span className="truncate font-mono text-[9px] uppercase tracking-tight text-slate-300 sm:text-[10px] sm:tracking-[0.06em]">
                {name}
              </span>
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[9px] leading-tight sm:mt-1 sm:text-[10px]",
                stepTextClass(step.status),
              )}
            >
              {step.status}
            </div>
            <div className="truncate font-mono text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
              {duration ?? "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
