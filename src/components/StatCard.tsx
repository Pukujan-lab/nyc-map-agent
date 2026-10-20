import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2",
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] leading-snug text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
