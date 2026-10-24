import { AlertCircle, Check, ChevronDown, Loader2, Mic, Send, Square } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stepLabel, type AgentStep } from "./agentSteps";
import { Waveform } from "./Waveform";

export interface HomeVoice {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * "Agents working" (#370): what the agent is doing right now, from the stream's
 * step lines, instead of a spinner. The first row is the agent reading the question.
 */
export function WorkingPanel({ steps }: { steps: AgentStep[] }) {
  const rows: AgentStep[] = [{ id: "planner", name: "", status: steps.length ? "done" : "start" }, ...steps];
  return (
    <div className="rounded-xl border bg-background/80 p-3" role="status" aria-live="polite" aria-label="Agents working" data-testid="agents-working">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agents working</div>
      <ul className="space-y-1.5 text-sm">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            {s.status === "start" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            ) : s.status === "done" ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className={cn(s.status === "done" && "text-muted-foreground")}>{s.id === "planner" ? "Planner: reading your question" : stepLabel(s.name)}</span>
            <span className="sr-only">{s.status === "start" ? "in progress" : s.status === "done" ? "done" : "failed"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface AgentHomeProps {
  input: string;
  setInput: (v: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
  voice: HomeVoice;
  /** A message to show by the bar (voice unsupported, mic blocked). */
  notice: string | null;
  onVoiceTap: () => void;
  sheetOpen: boolean;
  onCloseSheet: () => void;
  /** The answer list (messages, map-action buttons, working panel, trip card). */
  answers: ReactNode;
  /** Trip mode, hands-free and voice settings, reused from the classic sheet. */
  controls: ReactNode;
  /** The location-sharing line. */
  footer: ReactNode;
  /** Hide while something else owns the bottom of the screen (street view, a place sheet, the trip preview). */
  hidden: boolean;
  /** Extra space under the bar so the minimised place chip stays visible. */
  lift: boolean;
}

/**
 * The agent-first home (#370): a chat bar at the bottom of the map with a voice
 * button, a Siri-style listening state, and answers in a compact sheet above the
 * bar. It reuses AgentOverlay's stream, speech and map actions; no new backend.
 */
export function AgentHome(p: AgentHomeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { listening, stop } = p.voice;

  // Keep the newest answer in view while it streams.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  // Escape ends listening, like the Done button.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, stop]);

  useEffect(() => {
    if (p.notice && !p.voice.supported) inputRef.current?.focus();
  }, [p.notice, p.voice.supported]);

  if (p.hidden) return null;

  return (
    <div
      data-testid="agent-home"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[45] flex flex-col items-center gap-2 px-3",
        p.lift ? "pb-[calc(env(safe-area-inset-bottom)+4.25rem)]" : "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
      )}
    >
      {p.sheetOpen ? (
        <section
          aria-label="Assistant answers"
          data-testid="agent-answers"
          className="pointer-events-auto flex max-h-[min(48vh,460px)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 border-b py-1 pl-4 pr-1">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Ask the map</h2>
            {p.controls}
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Hide answers" onClick={p.onCloseSheet}>
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {p.answers}
          </div>
          {p.footer}
        </section>
      ) : null}

      {p.voice.listening ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Listening"
          data-testid="voice-listening"
          className="pointer-events-auto flex w-full max-w-[560px] flex-col items-center gap-2 rounded-3xl border bg-card/95 px-4 pb-3 pt-4 shadow-2xl backdrop-blur-md"
        >
          <div className="flex w-full items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
            Listening
            <span className="ml-auto text-xs font-normal text-muted-foreground">Nothing is recorded or saved.</span>
          </div>
          <Waveform active className="h-20 w-full" />
          <p className="min-h-[1.75rem] w-full text-center text-lg leading-snug" aria-live="polite">
            {p.voice.interim ? `“${p.voice.interim}”` : <span className="text-muted-foreground">Say where you want to go…</span>}
          </p>
          <Button type="button" size="lg" className="h-12 min-w-[160px] gap-2 rounded-full" onClick={p.voice.stop}>
            <Square className="h-4 w-4 fill-current" aria-hidden="true" /> Done talking
          </Button>
        </section>
      ) : (
        <form
          data-testid="agent-bar"
          className="pointer-events-auto flex w-full max-w-[560px] items-center gap-1.5 rounded-full border bg-card/95 p-1.5 shadow-xl backdrop-blur-md"
          onSubmit={(e) => { e.preventDefault(); p.onSend(p.input); }}
        >
          <input
            ref={inputRef}
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            placeholder="Ask anything: trips, restrooms, trains…"
            aria-label="Ask the assistant"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-11 w-11 shrink-0 rounded-full"
            aria-label={p.voice.supported ? "Ask by voice" : "Voice input is not available in this browser"}
            aria-disabled={!p.voice.supported || p.busy}
            onClick={p.onVoiceTap}
          >
            <Mic className="h-5 w-5" />
          </Button>
          <Button type="submit" size="icon" aria-label="Send" disabled={p.busy || !p.input.trim()} className="h-11 w-11 shrink-0 rounded-full">
            {p.busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      )}

      {p.notice ? (
        <p role="alert" data-testid="agent-notice" className="pointer-events-auto w-full max-w-[560px] rounded-xl border bg-card/95 px-3 py-2 text-sm shadow-md">
          {p.notice}
        </p>
      ) : null}
    </div>
  );
}
