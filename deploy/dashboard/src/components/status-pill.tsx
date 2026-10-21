import { cn } from "@/lib/utils";
import type { RunStatus, StepStatus } from "@/lib/types";

/**
 * The only strong colour on the page. Every tone means something; none of them
 * is decorative.
 */
export type Tone = "success" | "danger" | "warn" | "info" | "neutral";

const toneText: Record<Tone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  neutral: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const toneDot: Record<Tone, string> = {
  success: "bg-emerald-400",
  danger: "bg-red-400",
  warn: "bg-amber-400",
  info: "bg-blue-400",
  neutral: "bg-slate-400",
};

const toneBorder: Record<Tone, string> = {
  success: "border-emerald-500/30",
  danger: "border-red-500/30",
  warn: "border-amber-500/30",
  info: "border-blue-500/30",
  neutral: "border-border",
};

/** Same tone vocabulary, applied to a full-width notice surface. */
export const toneSurface: Record<Tone, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  danger: "border-red-500/30 bg-red-500/10 text-red-200",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  neutral: "border-border bg-muted/40 text-slate-300",
};

export const healthTone: Record<
  "healthy" | "unhealthy" | "starting" | "unknown",
  Tone
> = {
  healthy: "success",
  unhealthy: "danger",
  starting: "warn",
  unknown: "neutral",
};

export const runStatusTone: Record<RunStatus, Tone> = {
  succeeded: "success",
  failed: "danger",
  "rolled-back": "warn",
  running: "info",
  interrupted: "neutral",
};

export const stepStatusTone: Record<StepStatus, Tone> = {
  succeeded: "success",
  failed: "danger",
  running: "info",
  pending: "neutral",
  skipped: "neutral",
};

interface PillProps {
  tone: Tone;
  label: string;
  className?: string;
  pulse?: boolean;
}

export function Pill({ tone, label, className, pulse }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.04em] sm:px-2 sm:text-[10px]",
        toneText[tone],
        className,
      )}
    >
      <span className="relative flex size-1.5">
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-70",
              toneDot[tone],
            )}
          />
        ) : null}
        <span
          className={cn("relative inline-flex size-1.5 rounded-full", toneDot[tone])}
        />
      </span>
      {label}
    </span>
  );
}

export function HealthPill({ health }: { health: keyof typeof healthTone }) {
  return <Pill tone={healthTone[health] ?? "neutral"} label={health} />;
}

export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <Pill
      tone={runStatusTone[status] ?? "neutral"}
      label={status}
      pulse={status === "running"}
    />
  );
}

export function stepCardClass(status: StepStatus): string {
  return toneBorder[stepStatusTone[status]] ?? toneBorder.neutral;
}

export function stepDotClass(status: StepStatus): string {
  return toneDot[stepStatusTone[status]] ?? toneDot.neutral;
}

export function stepTextClass(status: StepStatus): string {
  switch (status) {
    case "succeeded":
      return "text-emerald-300";
    case "failed":
      return "text-red-300";
    case "running":
      return "text-blue-300";
    default:
      return "text-muted-foreground";
  }
}
