import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Banner } from "@/components/banner";
import { HistoryTable } from "@/components/history-table";
import { LiveCard } from "@/components/live-card";
import { LoginScreen } from "@/components/login-screen";
import { RunPanel } from "@/components/run-panel";
import { useNow } from "@/hooks/use-now";
import {
  ApiError,
  getDeploy,
  getStatus,
  postDeploy,
  postLogout,
  postRollback,
} from "@/lib/api";
import { formatClock } from "@/lib/format";
import type { Run, Status } from "@/lib/types";

type AuthState = "checking" | "authed" | "login";
type PendingAction = "deploy" | "rollback";

const POLL_IDLE_MS = 5000;
const POLL_RUNNING_MS = 2000;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") return `The deploy server returned ${error.message}.`;
    return error.message;
  }
  return "Unexpected error while talking to the deploy server.";
}

const Index = () => {
  const [auth, setAuth] = React.useState<AuthState>("checking");
  const [status, setStatus] = React.useState<Status | null>(null);
  const [lastGoodAt, setLastGoodAt] = React.useState<number | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(
    null,
  );
  const [confirmRollback, setConfirmRollback] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailRun, setDetailRun] = React.useState<Run | null>(null);

  const now = useNow(1000);

  const livePanelRef = React.useRef<HTMLDivElement | null>(null);
  const detailPanelRef = React.useRef<HTMLDivElement | null>(null);
  const inFlightRef = React.useRef<Promise<Status | null> | null>(null);
  const runningRef = React.useRef(false);

  const clearSession = React.useCallback(() => {
    setAuth("login");
    setStatus(null);
    setSelectedId(null);
    setDetailRun(null);
    setStatusError(null);
    setActionError(null);
    setNotice(null);
  }, []);

  /** One /status request at a time; concurrent callers share the in-flight one. */
  const loadStatus = React.useCallback((): Promise<Status | null> => {
    if (inFlightRef.current) return inFlightRef.current;

    const pending = (async () => {
      try {
        const next = await getStatus();
        setStatus(next);
        setLastGoodAt(Date.now());
        setStatusError(null);
        // A successful status is proof of a live session, including the refresh
        // that follows sign-in — leaving "login" here would strand the operator
        // on the password screen with a valid cookie.
        setAuth("authed");
        return next;
      } catch (error) {
        if (error instanceof ApiError && error.kind === "unauthorized") {
          clearSession();
          return null;
        }
        // Keep the last known data on screen; only report the failure.
        setStatusError(messageFor(error));
        setAuth((previous) => (previous === "checking" ? "authed" : previous));
        return null;
      }
    })().finally(() => {
      inFlightRef.current = null;
    });

    inFlightRef.current = pending;
    return pending;
  }, [clearSession]);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  React.useEffect(() => {
    runningRef.current = status?.running != null;
  }, [status]);

  // Polling loop: the next tick is scheduled only after the previous response
  // settles, so a slow request delays the tick instead of stacking requests.
  React.useEffect(() => {
    if (auth !== "authed" || !autoRefresh) return;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      await loadStatus();
      if (cancelled) return;
      timer = window.setTimeout(
        tick,
        runningRef.current ? POLL_RUNNING_MS : POLL_IDLE_MS,
      );
    };

    timer = window.setTimeout(
      tick,
      runningRef.current ? POLL_RUNNING_MS : POLL_IDLE_MS,
    );

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [auth, autoRefresh, loadStatus]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  React.useEffect(() => {
    if (!selectedId) return;
    detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const handleActionError = React.useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.kind === "unauthorized") {
          clearSession();
          return;
        }
        if (error.kind === "busy") {
          setNotice("A deploy is already running.");
          void loadStatus();
          return;
        }
      }
      setActionError(messageFor(error));
    },
    [clearSession, loadStatus],
  );

  const runAction = React.useCallback(
    async (action: PendingAction) => {
      setPendingAction(action);
      setNotice(null);
      setActionError(null);
      try {
        if (action === "deploy") await postDeploy();
        else await postRollback();
        await loadStatus();
      } catch (error) {
        handleActionError(error);
      } finally {
        setPendingAction(null);
      }
    },
    [handleActionError, loadStatus],
  );

  const handleDeploy = () => {
    if (pendingAction || status?.running) return;
    void runAction("deploy");
  };

  const handleRollback = () => {
    if (pendingAction || status?.running) return;
    setConfirmRollback(true);
  };

  const handleSelectRun = (run: Run) => {
    if (run.status === "running" || run.id === status?.running?.id) {
      setSelectedId(null);
      setDetailRun(null);
      livePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSelectedId(run.id);
    setDetailRun(run);
    void getDeploy(run.id)
      .then((fresh) => {
        setDetailRun((current) =>
          current && current.id === fresh.id ? fresh : current,
        );
      })
      .catch(() => {
        // The row already carries what the panel needs, so a failed detail
        // fetch is not worth interrupting the operator for.
      });
  };

  const handleLogout = async () => {
    try {
      await postLogout();
    } catch {
      // Clearing the local view matters more than the reply.
    }
    clearSession();
  };

  const handleRunFinished = React.useCallback(() => {
    void loadStatus();
  }, [loadStatus]);

  const previousImage = React.useMemo(() => {
    const current = status?.current;
    if (!current) return null;
    const colon = current.image.lastIndexOf(":");
    const repository = colon > 0 ? current.image.slice(0, colon) : current.image;
    const previous = status?.runs.find(
      (run) => run.status === "succeeded" && run.sha !== current.sha,
    );
    return previous ? `${repository}:${previous.sha.slice(0, 12)}` : null;
  }, [status]);

  if (auth === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Connecting
        </div>
      </div>
    );
  }

  if (auth === "login") {
    return <LoginScreen onSuccess={() => void loadStatus()} />;
  }

  const running = status?.running ?? null;
  const runs = status?.runs ?? [];
  const busy = running != null || pendingAction != null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold tracking-tight">
              NYC Map Agent
            </span>
            <span className="text-sm text-muted-foreground">— Deploys</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer select-none items-center gap-1.5">
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Auto-refresh status"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Auto
              </span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void handleLogout()}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-3 px-4 pb-16 pt-4 sm:space-y-4 sm:pt-5">
        {statusError ? (
          <Banner tone="danger" onDismiss={() => setStatusError(null)}>
            <span className="font-medium">Could not refresh status.</span>{" "}
            {statusError}
            <span className="text-red-200/70">
              {" "}
              Last successful refresh{" "}
              {lastGoodAt
                ? formatClock(new Date(lastGoodAt).toISOString())
                : "never"}
              .
            </span>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
            >
              <RefreshCw className="size-3" />
              Retry
            </button>
          </Banner>
        ) : null}

        {actionError ? (
          <Banner tone="danger" onDismiss={() => setActionError(null)}>
            {actionError}
          </Banner>
        ) : null}

        {notice ? (
          <Banner tone="warn" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        ) : null}

        <LiveCard
          current={status?.current ?? null}
          running={running != null}
          pendingAction={pendingAction}
          now={now}
          onDeploy={handleDeploy}
          onRollback={handleRollback}
        />

        {running ? (
          <div ref={livePanelRef} className="scroll-mt-16">
            <RunPanel run={running} live now={now} onFinished={handleRunFinished} />
          </div>
        ) : null}

        {detailRun && detailRun.id !== running?.id ? (
          <div ref={detailPanelRef} className="scroll-mt-16">
            <RunPanel
              run={detailRun}
              live={false}
              now={now}
              onClose={() => {
                setSelectedId(null);
                setDetailRun(null);
              }}
            />
          </div>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Deploy history
            </h2>
            <span className="font-mono text-[10px] text-muted-foreground">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
          </div>
          <HistoryTable
            runs={runs}
            runningId={running?.id ?? null}
            selectedId={selectedId}
            now={now}
            onSelect={handleSelectRun}
          />
        </section>
      </main>

      <AlertDialog open={confirmRollback} onOpenChange={setConfirmRollback}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to the previous image?</AlertDialogTitle>
            <AlertDialogDescription>
              This starts a deploy that swaps the live image back to{" "}
              <span className="break-all font-mono text-foreground">
                {previousImage ?? "the previous image"}
              </span>
              {status?.current ? (
                <>
                  , replacing{" "}
                  <span className="break-all font-mono text-foreground">
                    {status.current.image}
                  </span>
                </>
              ) : null}
              . The rollback runs through the same fetch, build, swap and health
              steps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRollback(false);
                if (!busy) void runAction("rollback");
              }}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
