import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RunStatusPill } from "@/components/status-pill";
import { formatAbsolute, formatDuration, formatRelative, shortSha } from "@/lib/format";
import type { Run } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HistoryTableProps {
  runs: Run[];
  runningId: string | null;
  selectedId: string | null;
  now: number;
  onSelect: (run: Run) => void;
}

export function HistoryTable({
  runs,
  runningId,
  selectedId,
  now,
  onSelect,
}: HistoryTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-[80px] px-2 text-[10px] uppercase tracking-[0.08em] sm:w-[130px]">
              Started
            </TableHead>
            <TableHead className="h-9 px-2 text-[10px] uppercase tracking-[0.08em]">
              Commit
            </TableHead>
            <TableHead className="h-9 w-[100px] px-2 text-[10px] uppercase tracking-[0.08em] sm:w-[128px]">
              Status
            </TableHead>
            <TableHead className="h-9 w-[56px] px-2 text-right text-[10px] uppercase tracking-[0.08em] sm:w-[88px]">
              Duration
            </TableHead>
            <TableHead className="h-9 w-[46px] px-2 text-right text-[10px] uppercase tracking-[0.08em] sm:w-[56px]">
              Log
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={5}
                className="h-24 px-3 text-center text-xs text-muted-foreground"
              >
                No deploys recorded yet.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => {
              const isRunning = run.id === runningId || run.status === "running";
              const isSelected = run.id === selectedId;
              return (
                <TableRow
                  key={run.id}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(
                    "cursor-pointer border-border/60",
                    isSelected && "bg-muted/60 hover:bg-muted/60",
                  )}
                  onClick={() => onSelect(run)}
                >
                  <TableCell
                    className="px-2 py-2 font-mono text-[11px] text-slate-300"
                    title={formatAbsolute(run.startedAt)}
                  >
                    <span className="block truncate">
                      {formatRelative(run.startedAt, now)}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-2 font-mono text-[11px]">
                    <span className="text-slate-200">{shortSha(run.sha)}</span>
                    <span className="ml-2 hidden truncate text-[10px] text-muted-foreground/60 md:inline">
                      {run.id}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-2">
                    <RunStatusPill status={run.status} />
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {isRunning && run.durationMs == null
                      ? "—"
                      : formatDuration(run.durationMs)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(run);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                        isSelected
                          ? "border-slate-500/60 bg-slate-500/20 text-slate-100"
                          : "border-border text-muted-foreground hover:border-slate-500/60 hover:text-foreground",
                      )}
                    >
                      Log
                    </button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
