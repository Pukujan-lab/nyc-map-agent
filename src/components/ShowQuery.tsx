import { useState } from "react";
import { Code2 } from "lucide-react";
import type { SoqlSource } from "@/lib/geo/types";
import { cn } from "@/lib/utils";

interface ShowQueryProps {
  sources: SoqlSource[];
  className?: string;
}

export function ShowQuery({ sources, className }: ShowQueryProps) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className={cn("mt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Code2 className="h-3 w-3" aria-hidden />
        {open ? "Hide query" : "Show query"}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-2">
          {sources.map((source) => (
            <div key={`${source.label}-${source.query.slice(0, 24)}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {source.label}
              </div>
              <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {source.query}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
