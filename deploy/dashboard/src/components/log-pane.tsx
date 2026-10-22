import * as React from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { subscribeToLog } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_LINES = 2000;

interface Row {
  key: number;
  at: string;
  line: string;
}

interface LogPaneProps {
  runId: string;
  onFinished?: () => void;
  className?: string;
}

function LogPaneImpl({ runId, onFinished, className }: LogPaneProps) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [dropped, setDropped] = React.useState(0);
  const [state, setState] = React.useState<"streaming" | "done" | "error">(
    "streaming",
  );
  const [stick, setStick] = React.useState(true);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const stickRef = React.useRef(true);
  const finishedRef = React.useRef(onFinished);
  const seqRef = React.useRef(0);
  const totalRef = React.useRef(0);

  React.useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  React.useEffect(() => {
    setRows([]);
    setDropped(0);
    setState("streaming");
    stickRef.current = true;
    setStick(true);
    totalRef.current = 0;

    const unsubscribe = subscribeToLog(runId, {
      onLine: (entry) => {
        totalRef.current += 1;
        const row: Row = {
          key: (seqRef.current += 1),
          at: entry.at,
          line: entry.line,
        };
        setRows((previous) => {
          const next = previous.concat(row);
          if (next.length <= MAX_LINES) return next;
          return next.slice(next.length - MAX_LINES);
        });
        const overflow = totalRef.current - MAX_LINES;
        if (overflow > 0) setDropped(overflow);
      },
      onDone: () => {
        setState("done");
        finishedRef.current?.();
      },
      onError: () => setState("error"),
    });

    return unsubscribe;
  }, [runId]);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [rows]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    stickRef.current = atBottom;
    setStick(atBottom);
  };

  const jumpToLatest = () => {
    const element = scrollRef.current;
    if (!element) return;
    stickRef.current = true;
    setStick(true);
    element.scrollTop = element.scrollHeight;
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="log-scroll log-surface h-[300px] overflow-auto rounded-md border border-border/70 font-mono text-[11px] leading-[1.6] sm:h-[400px] sm:text-xs"
      >
        {rows.length === 0 ? (
          <div className="p-3 text-muted-foreground">
            {state === "done"
              ? "No log output was recorded for this run."
              : state === "error"
                ? "Log stream ended unexpectedly."
                : "Waiting for log output…"}
          </div>
        ) : (
          <div className="w-max min-w-full px-3 py-2">
            {dropped > 0 ? (
              <div className="pb-1 text-muted-foreground/60">
                … {dropped} earlier line{dropped === 1 ? "" : "s"} truncated
              </div>
            ) : null}
            {rows.map((row) => (
              <div key={row.key} className="flex gap-3 whitespace-pre">
                <span className="shrink-0 select-none text-muted-foreground/45">
                  {formatClock(row.at)}
                </span>
                <span className="text-slate-200/90">{row.line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!stick && rows.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-3 h-7 gap-1 px-2 text-[11px] shadow-lg"
        >
          <ArrowDown className="size-3" />
          Jump to latest
        </Button>
      ) : null}
    </div>
  );
}

export const LogPane = React.memo(LogPaneImpl);
