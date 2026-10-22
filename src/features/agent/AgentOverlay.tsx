import { Bus, Car, Footprints, Headphones, Mic, MicOff, MoreVertical, Pause, Play, Send, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useFlag } from "@/lib/flags";
import { getMapInstance } from "@/lib/map/mapInstance";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel } from "@/lib/store/PanelContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/lib/voice/useSpeech";
import { spokenSummary } from "@/lib/voice/tts";
import { executeCommand, type ExecutorContext } from "./executor";
import type { Trip, TripMode } from "./schema";
import { askAgent } from "./stream";
import { TripSummary } from "./TripSummary";
import { showTrip } from "./tripLayer";
import { sharedCoords, startSharing, stopSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { usePlayer, type Speed } from "./usePlayer";
import { useWakePhrase } from "./useWakePhrase";
import { useHandsFree } from "./useHandsFree";
import { closeAsk, useAskRequest } from "@/lib/agent/streetContext";

interface Msg { id: string; role: "user" | "assistant"; content: string }

const MODES: Array<{ id: TripMode; label: string; Icon: typeof Bus }> = [
  { id: "walk", label: "Walk", Icon: Footprints },
  { id: "transit", label: "Transit", Icon: Bus },
  { id: "drive", label: "Drive", Icon: Car },
];

export default function AgentOverlay() {
  const { chatOpen, setChatOpen, flyTo, startWalk } = useMapState();
  const { showPanel } = usePanel();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const driveOn = useFlag("agentDrive");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [mode, setMode] = useState<TripMode>("transit");
  const [wake, setWake] = useState(false);
  const [mapTime, setMapTime] = useState<string | null>(null);
  const shared = useSharedLocation();
  const abort = useRef<AbortController | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const askReq = useAskRequest();
  const compact = askReq !== null;

  const speech = useSpeech({ onFinalTranscript: (t) => void send(t) });
  const player = usePlayer((text) => speech.speak(text));

  const ctx: ExecutorContext = {
    flyTo: (lon, lat, zoom) => flyTo({ lon, lat, zoom }),
    showTrip: (t) => { setTrip(t); const m = getMapInstance(); if (m) showTrip(m, t); },
    openTrip: (t) => {
      setTrip(t);
      showPanel({ id: `agent:trip:${t.id}`, title: `To ${t.destination.label}`, subtitle: `${t.departIso.slice(11)} → ${t.arriveIso.slice(11)}`, summary: <TripSummary trip={t} compact />, details: <TripSummary trip={t} bodyOnly /> });
    },
    enterStreetView: (lon, lat) => startWalk({ lon, lat }),
    playFlythrough: (t, speed) => { setTrip(t); setChatOpen(false); player.start(t, speed); },
    setTime: (iso) => setMapTime(iso),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    if (!askReq) setChatOpen(true);
    const history: Msg[] = [...messages, { id: crypto.randomUUID(), role: "user", content: q }];
    const reply: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages([...history, reply]);
    setBusy(true);
    abort.current?.abort();
    abort.current = new AbortController();
    // Only a position the person chose to share with My location; never asked for here.
    const location = sharedCoords();
    let spoken = "";
    try {
      for await (const ev of askAgent({ messages: history.map(({ role, content }) => ({ role, content })), location, mode, now: new Date().toISOString(), ...(askReq ? { context: askReq.context } : {}) }, abort.current.signal)) {
        if (ev.type === "text") {
          spoken += ev.text;
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content + ev.text } : x)));
        } else if (ev.type === "command") {
          executeCommand(ev.command, ctxRef.current);
        } else if (ev.type === "error") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || ev.message } : x)));
        }
      }
    } catch {
      setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || "The assistant is unavailable right now." } : x)));
    } finally {
      setBusy(false);
      // Short spoken answer; the full detail stays on screen. In hands-free the
      // person can talk over it to interrupt.
      if (spoken) speech.speak(spokenSummary(spoken), { bargeIn: handsFree });
    }
  }, [busy, messages, mode, setChatOpen, speech, askReq, handsFree]);

  const turnOffHandsFree = useCallback(() => setHandsFree(false), []);
  useHandsFree({ on: handsFree, supported: speech.sttSupported, listening: speech.listening, busy, speaking: speech.speaking, error: speech.error, start: speech.startListening, stop: speech.stopListening, turnOff: turnOffHandsFree });
  const toggleHandsFree = () => {
    if (handsFree) { setHandsFree(false); speech.stopListening(); return; }
    speech.setMuted(false);
    speech.clearError();
    setHandsFree(true);
  };

  useWakePhrase(wake && speech.sttSupported, speech.listening || busy || speech.speaking, (t) => void send(t));
  useEffect(() => () => abort.current?.abort(), []);

  const ModeIcon = MODES.find((m) => m.id === mode)!.Icon;
  const modes = MODES.filter((m) => m.id !== "drive" || driveOn);

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b py-3 pl-4 pr-12">
        <div className="flex-1 text-sm font-semibold">{compact ? "Ask about this spot" : "Ask the map"}</div>
        <Button
          type="button"
          variant={handsFree ? "default" : "secondary"}
          size="sm"
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
          aria-pressed={handsFree}
          disabled={!speech.sttSupported}
          title={speech.sttSupported ? undefined : "Voice input is not available in this browser"}
          onClick={toggleHandsFree}
        >
          <Headphones className="h-3.5 w-3.5" /> Hands-free
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="h-7 gap-1 rounded-full px-2.5 text-xs" aria-label={`Trip mode: ${mode}`}>
              <ModeIcon className="h-3.5 w-3.5" /> {MODES.find((m) => m.id === mode)!.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as TripMode)}>
              {modes.map(({ id, label, Icon }) => (
                <DropdownMenuRadioItem key={id} value={id}><Icon className="mr-2 h-4 w-4" />{label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Assistant settings"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Voice</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={wake} disabled={!speech.sttSupported} onCheckedChange={(v) => setWake(v === true)}>
              Listen for “Hey map”
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={!speech.muted} onCheckedChange={(v) => speech.setMuted(v !== true)}>Speak answers</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {speech.sttSupported
                ? "Hold a conversation by voice: tap the mic, or turn on “Hey map”. Your location is sent only after you tap My location, and only for that question."
                : "Voice input is not available in this browser, so type instead. Answers can still be spoken."}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {handsFree || speech.listening || (speech.speaking && handsFree) ? (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-1.5 text-xs" role="status" data-testid="voice-status">
          <span className={cn("h-2 w-2 rounded-full", speech.listening ? "animate-pulse bg-destructive" : busy || speech.speaking ? "animate-pulse bg-primary" : "bg-muted-foreground")} />
          <span>{speech.listening ? (speech.interim ? `Listening: “${speech.interim}”` : "Listening") : busy ? "Thinking…" : speech.speaking ? (handsFree ? "Speaking (talk to interrupt)" : "Speaking") : "Hands-free on"}</span>
          <span className="ml-auto text-muted-foreground">Nothing is recorded or saved.</span>
        </div>
      ) : null}
      {speech.error && handsFree ? <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">{speech.error}</p> : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Ask anything about getting around. For example:</p>
            {["How will my trip be tomorrow from here to Grand Central at 9am?", "Walk me from Union Square to Washington Square Park"].map((q) => (
              <Button key={q} variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void send(q)}>{q}</Button>
            ))}
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("max-w-[90%] rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
              {m.content || (busy ? "…" : "")}
            </div>
          ))
        )}
        {trip ? (
          <div className="rounded-lg border p-3">
            <TripSummary trip={trip} mapTime={mapTime} />
            <Button size="sm" className="mt-3 w-full gap-2" onClick={() => ctx.playFlythrough(trip, 10)}><Play className="h-4 w-4" /> Preview trip</Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-3 pt-2 text-xs text-muted-foreground" role="status">
        {shared.status === "on" ? (
          <>
            <span>Using your exact location for directions. It is not saved.</span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-2.5 text-xs" onClick={() => stopSharing()}>
              Stop sharing location
            </Button>
          </>
        ) : (
          <>
            <span>{shared.status === "denied" ? "Location is blocked in this browser." : shared.status === "asking" ? "Finding your location…" : "Your location is not shared."}</span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-2.5 text-xs" disabled={shared.status === "asking"} onClick={() => void startSharing()}>
              Use my location
            </Button>
          </>
        )}
      </div>
      <form className="flex items-end gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        {speech.listening ? (
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border px-3 text-sm" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            <span className="truncate text-muted-foreground">{speech.interim || "Listening…"}</span>
          </div>
        ) : (
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            placeholder="Where to?"
            aria-label="Ask the assistant"
            className="min-h-9 flex-1 resize-none"
          />
        )}
        {speech.sttSupported ? (
          <Button type="button" size="icon" variant={speech.listening ? "destructive" : "ghost"} aria-label={speech.listening ? "Stop listening" : "Push to talk"} aria-pressed={speech.listening} onClick={() => (speech.listening ? speech.stopListening() : speech.startListening())} className="h-9 w-9 shrink-0">
            {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        ) : null}
        <Button type="submit" size="icon" aria-label="Send" disabled={busy || !input.trim()} className="h-9 w-9 shrink-0"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );

  if (compact) {
    const slot = typeof document === "undefined" ? null : document.getElementById("ask-street-slot");
    const panel = (
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Ask about this spot"
        data-testid="ask-compact"
        className="pointer-events-auto absolute bottom-3 left-1/2 z-[60] flex h-[min(46vh,420px)] w-[min(440px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur-md"
      >
        <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5 z-10 h-8 w-8" aria-label="Close Ask" onClick={() => { setHandsFree(false); speech.stopListening(); closeAsk(); }}>
          <X className="h-4 w-4" />
        </Button>
        {body}
      </div>
    );
    return slot ? createPortal(panel, slot) : <div className="fixed inset-x-0 bottom-0 z-[60] h-0">{panel}</div>;
  }

  return (
    <>
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side={isDesktop ? "right" : "bottom"} className={isDesktop ? "flex h-full w-full flex-col p-0 sm:max-w-[420px]" : "flex h-[85vh] flex-col p-0"}>
          <SheetTitle className="sr-only">Ask the map</SheetTitle>
          <SheetDescription className="sr-only">Voice and text trip assistant</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
      {player.state.active ? (
        <PlaybackBar
          playing={player.state.playing}
          speed={player.state.speed}
          callout={player.state.callout}
          step={`${player.state.seg + 1}/${player.state.segs.length}`}
          onToggle={player.toggle}
          onSpeed={player.setSpeed}
          onSkip={player.skip}
          onClose={player.stop}
        />
      ) : null}
    </>
  );
}

/** The one slim preview bar: play/pause, speed, skip leg, close. No tooltips. */
function PlaybackBar(p: { playing: boolean; speed: Speed; callout: string; step: string; onToggle: () => void; onSpeed: (s: Speed) => void; onSkip: () => void; onClose: () => void }) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-40 flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-lg backdrop-blur-md" role="region" aria-label="Trip preview">
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={p.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
        {p.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 rounded-full px-2 text-xs tabular-nums" aria-label={`Speed ${p.speed}x`}>{p.speed}x</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={String(p.speed)} onValueChange={(v) => p.onSpeed(Number(v) as Speed)}>
            {[2, 10, 30].map((s) => <DropdownMenuRadioItem key={s} value={String(s)}>{s}x</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Skip to next leg" onClick={p.onSkip}><SkipForward className="h-4 w-4" /></Button>
      <div className="min-w-0 flex-1 truncate px-1 text-sm" aria-live="polite">{p.callout}</div>
      <Badge variant="secondary" className="tabular-nums">{p.step}</Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Close preview" onClick={p.onClose}><X className="h-4 w-4" /></Button>
    </div>
  );
}
