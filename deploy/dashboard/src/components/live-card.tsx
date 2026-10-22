import { Loader2, RotateCcw, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/status-pill";
import { formatAbsolute, formatRelative, shortSha } from "@/lib/format";
import type { CurrentDeploy } from "@/lib/types";

interface LiveCardProps {
  current: CurrentDeploy | null;
  running: boolean;
  pendingAction: "deploy" | "rollback" | null;
  now: number;
  onDeploy: () => void;
  onRollback: () => void;
}

export function LiveCard({
  current,
  running,
  pendingAction,
  now,
  onDeploy,
  onRollback,
}: LiveCardProps) {
  const busy = running || pendingAction !== null;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Currently live
          </span>
          {current ? <HealthPill health={current.health} /> : null}
        </div>

        {current ? (
          <>
            <div className="min-w-0">
              <h1 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
                {current.subject}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-xs">
                <span className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-slate-200">
                  {shortSha(current.sha)}
                </span>
                <span className="break-all text-muted-foreground">
                  {current.image}
                </span>
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                deployed{" "}
                <span className="text-slate-300">
                  {formatRelative(current.deployedAt, now)}
                </span>
                <span className="px-1 text-muted-foreground/40">·</span>
                <span title={formatAbsolute(current.deployedAt)}>
                  {formatAbsolute(current.deployedAt)}
                </span>
              </p>
            </div>
          </>
        ) : (
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Nothing deployed yet
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              No image has been promoted on this host. Deploy the latest{" "}
              <span className="font-mono">origin/main</span> to get started.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="order-2 text-[11px] text-muted-foreground sm:order-1">
            {running
              ? "Actions are disabled while a deploy is running."
              : pendingAction
                ? "Waiting for the deploy server…"
                : current
                  ? "Deploys run on gravebuster and swap the live image on success."
                  : "No previous image to roll back to."}
          </p>
          <div className="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="sm"
              className="h-9 w-full sm:w-auto"
              onClick={onDeploy}
              disabled={busy}
            >
              {pendingAction === "deploy" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Rocket />
              )}
              Deploy latest
            </Button>
            {current ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 w-full sm:w-auto"
                onClick={onRollback}
                disabled={busy}
              >
                {pendingAction === "rollback" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                Roll back to previous
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
