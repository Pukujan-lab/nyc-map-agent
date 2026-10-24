import { Bus, Car, Footprints, Headphones, LocateFixed, Mic, MicOff, MoreVertical, Pause, Play, Send, SkipForward, X } from "lucide-react";
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
import { revealTripBuses } from "@/lib/transit/busReveal";
import { setFollowed } from "@/lib/transit/follow";
import { usePanel } from "@/lib/store/PanelContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/lib/voice/useSpeech";
import { spokenSummary } from "@/lib/voice/tts";
import { executeCommand, type ExecutorContext } from "./executor";
import { PLAYBACK_SPEEDS, langTag, type MapAction, type PlaybackSpeed, type Trip, type TripMode } from "./schema";
import { askAgent } from "./stream";
import { TripSummary, selectAlternative } from "./TripSummary";
import { routeColor, showPoints, showTrip } from "./tripLayer";
import { runMapAction, type MapActionContext } from "./mapActions";
import { AnswerActions, RestroomSpotDetails } from "./AnswerActions";
import { AnswerSources, type AnswerSourcesLine } from "./AnswerSources";
import { formatStreetText } from "@/lib/streetName";
import { sharedCoords, startSharing, stopSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { usePlayer, type Speed } from "./usePlayer";
import { useWakePhrase } from "./useWakePhrase";
import { useHandsFree } from "./useHandsFree";
import { closeAsk, useAskRequest } from "@/lib/agent/streetContext";
import { AgentHome, WorkingPanel } from "./AgentHome";
import { applyStep, statusLine, type AgentStep } from "./agentSteps";
import { speechTag, statusLang } from "./statusLines";
import { needsSharedOrigin, ORIGIN_PROMPT, replyAsksForOrigin } from "./needsOrigin";

interface Msg { id: string; role: "user" | "assistant"; content: string; offerLocation?: boolean; actions?: MapAction[]; sources?: AnswerSourcesLine }

/** A spoken status line covers a voice question that is still working after this long (#370). */
const STATUS_AFTER_MS = 2500;
const VOICE_UNSUPPORTED = "Voice input isn't available in this browser. Type your question instead.";

/** The browser language, when it is a tag the server accepts. */
function browserLang(): string | undefined {
  const l = typeof navigator === "undefined" ? undefined : navigator.language;
  return l && langTag.safeParse(l).success ? l : undefined;
}

const MODES: Array<{ id: TripMode; label: string; Icon: typeof Bus }> = [
  { id: "walk", label: "Walk", Icon: Footprints },
  { id: "transit", label: "Transit", Icon: Bus },
  { id: "drive", label: "Drive", Icon: Car },
];

export default function AgentOverlay() {
  const { chatOpen, setChatOpen, flyTo, startWalk, stopWalk, chatSeed, clearSeed, setRestrooms, walking, streetViewOpen } = useMapState();
  const { showPanel, closeAll, content: panelContent, minimized: panelMinimized, drawerOpen } = usePanel();
  // Agent-first home (#370): bottom chat bar, voice waveform, visible steps.
  const home = useFlag("agentHome");
  const [lang] = useState(browserLang);
  // One panel at a time (#225): opening Ask closes the drawer and any sheet.
  useEffect(() => {
    if (chatOpen) closeAll();
  }, [chatOpen, closeAll]);
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
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  /** The question waiting on a shared location, so the button can ask it again. */
  const pendingQuestion = useRef<string | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const askReq = useAskRequest();
  const compact = askReq !== null;

  const [steps, setSteps] = useState<AgentStep[]>([]);
  const stepsRef = useRef<AgentStep[]>([]);
  stepsRef.current = steps;
  const [notice, setNotice] = useState<string | null>(null);
  /** The next send came from speech, so a long wait gets a spoken status line. */
  const voiceTurn = useRef(false);
  const speech = useSpeech({ onFinalTranscript: (t) => { voiceTurn.current = true; void send(t); }, lang: home ? lang : undefined });
  const player = usePlayer((text) => speech.speak(text));
  /** Speed the next Play uses: the agent's pick or the person's last tap. */
  const [prefSpeed, setPrefSpeed] = useState<PlaybackSpeed>(10);
  // Ask, the route fit, and the preview all move the camera. Follow and street
  // view let go first, without the Stop following glide back. Starting the
  // preview keeps the player (it is the new camera owner).
  const handoffCamera = (keepPreview = false) => {
    setFollowed(null);
    if (!keepPreview) player.release();
    stopWalk();
    getMapInstance()?.stop();
  };
  /**
   * Another option chosen (chat card or trip panel): redraw it and, if the
   * preview is loaded, restart it on that route from its start. A playing
   * preview keeps the camera, so the map does not fit to the new route then.
   */
  const chooseTrip = (next: Trip) => {
    revealTripBuses(next);
    setTrip(next);
    const m = getMapInstance();
    if (m) showTrip(m, next, { fit: !player.state.playing });
    player.select(next);
  };
  const chooseRef = useRef(chooseTrip);
  chooseRef.current = chooseTrip;
  /** The Play button: the only thing that starts the preview. */
  const startPreview = (t: Trip, speed: PlaybackSpeed) => {
    handoffCamera(true);
    revealTripBuses(t);
    setTrip(t);
    setPrefSpeed(speed);
    setChatOpen(false);
    player.start(t, speed);
  };

  const ctx: ExecutorContext = {
    flyTo: (lon, lat, zoom) => { handoffCamera(); flyTo({ lon, lat, zoom }); },
    showTrip: (t) => { handoffCamera(); revealTripBuses(t); setTrip(t); const m = getMapInstance(); if (m) showTrip(m, t); },
    openTrip: (t) => {
      revealTripBuses(t);
      setTrip(t);
      showPanel({
        id: `agent:trip:${t.id}`, title: `To ${t.destination.label}`, subtitle: `${t.departIso.slice(11)} → ${t.arriveIso.slice(11)}`,
        summary: <TripSummary trip={t} compact onSelect={(alt) => { const next = selectAlternative(t, alt); chooseRef.current(next); ctxRef.current.openTrip(next); }} />,
        details: <TripSummary trip={t} bodyOnly />,
      });
    },
    enterStreetView: (lon, lat) => { handoffCamera(); startWalk({ lon, lat }); },
    // The agent only loads the preview; it waits for Play (asking for a trip must not start it).
    playFlythrough: (t, speed) => {
      revealTripBuses(t);
      setTrip(t);
      setPrefSpeed(speed);
      const m = getMapInstance();
      if (m) showTrip(m, t);
      player.load(t, speed);
    },
    setTime: (iso) => setMapTime(iso),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Answer buttons (#371): each draws what a tool returned, then gets out of the map's way on a phone.
  const actionCtx: MapActionContext = {
    flyTo: ctx.flyTo,
    showTrip: ctx.showTrip,
    showRestroom: (r) => {
      handoffCamera();
      setRestrooms(true);
      const m = getMapInstance();
      if (m) showPoints(m, [{ at: [r.lon, r.lat], name: formatStreetText(r.name) }], "#2563eb");
      else flyTo({ lon: r.lon, lat: r.lat, zoom: 17 });
      showPanel({ id: `restroom:${r.name}`, title: formatStreetText(r.name), subtitle: "Public restroom", details: <RestroomSpotDetails restroom={r} /> });
    },
    showPoints: (points, { color }) => {
      handoffCamera();
      const m = getMapInstance();
      if (m) showPoints(m, points, color);
    },
  };
  const runAction = (a: MapAction) => {
    runMapAction(a, actionCtx, routeColor);
    if (!isDesktop && !compact) setChatOpen(false);
  };

  const send = useCallback(async (text: string) => {
    closeAll();
    const q = text.trim();
    const byVoice = voiceTurn.current;
    voiceTurn.current = false;
    if (!q || busy) return;
    setNotice(null);
    setInput("");
    if (!askReq) setChatOpen(true);
    // A second tap of the same question, after Use my location, keeps the one user bubble.
    const continuing = messagesRef.current.some((m) => m.offerLocation);
    const prior = messagesRef.current.filter((m) => !m.offerLocation);
    const lastUser = [...prior].reverse().find((m) => m.role === "user");
    const history: Msg[] = continuing && lastUser?.content === q ? prior : [...prior, { id: crypto.randomUUID(), role: "user", content: q }];
    // Only a position the person chose to share; never asked for here. Street view already has a spot.
    const location = sharedCoords();
    if (!askReq && !location && needsSharedOrigin(q)) {
      pendingQuestion.current = q;
      const reply: Msg = { id: crypto.randomUUID(), role: "assistant", content: ORIGIN_PROMPT, offerLocation: true };
      setMessages([...history, reply]);
      speech.speak(spokenSummary(reply.content), { bargeIn: handsFree });
      return;
    }
    pendingQuestion.current = null;
    const reply: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages([...history, reply]);
    setBusy(true);
    setSteps([]);
    abort.current?.abort();
    abort.current = new AbortController();
    let spoken = "";
    // A voice question still working after ~2.5 s gets one short spoken status line.
    const sayIn = statusLang(q, lang);
    const statusTimer = home && byVoice ? window.setTimeout(() => speech.speak(statusLine(stepsRef.current, sayIn), { lang: speechTag(sayIn, lang) }), STATUS_AFTER_MS) : undefined;
    try {
      for await (const ev of askAgent({ messages: history.map(({ role, content }) => ({ role, content })), location, mode, now: new Date().toISOString(), ...(askReq ? { context: askReq.context } : {}), ...(home && lang ? { lang } : {}) }, abort.current.signal)) {
        setSteps((s) => applyStep(s, ev));
        if (ev.type === "text") {
          spoken += ev.text;
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content + ev.text } : x)));
        } else if (ev.type === "command") {
          executeCommand(ev.command, ctxRef.current);
        } else if (ev.type === "actions") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, actions: ev.actions } : x)));
        } else if (ev.type === "sources") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, sources: ev } : x)));
        } else if (ev.type === "error") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || ev.message } : x)));
        }
      }
    } catch {
      setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || "The assistant is unavailable right now." } : x)));
    } finally {
      window.clearTimeout(statusTimer);
      setBusy(false);
      // The model still asked for a start: put the same button on its reply.
      if (!askReq && spoken && !sharedCoords() && replyAsksForOrigin(spoken)) {
        pendingQuestion.current = q;
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, offerLocation: true } : x)));
      }
      // Short spoken answer; the full detail stays on screen. In hands-free the
      // person can talk over it to interrupt.
      if (spoken) speech.speak(spokenSummary(spoken), { bargeIn: handsFree });
    }
  }, [busy, mode, setChatOpen, speech, askReq, handsFree, closeAll, home, lang]);

  // The reply button and the footer chip both share location, then ask the waiting question.
  const enableLocation = useCallback(async () => {
    const coords = await startSharing();
    const q = pendingQuestion.current;
    if (!coords || !q) return;
    pendingQuestion.current = null;
    void send(q);
  }, [send]);

  // ChatPanel is unmounted while this overlay replaces it, so the top bar's
  // question has to be sent from here or Ask the map opens on the examples.
  useEffect(() => {
    if (!chatSeed) return;
    const text = chatSeed.text;
    clearSeed();
    void send(text);
  }, [chatSeed, clearSeed, send]);

  const turnOffHandsFree = useCallback(() => setHandsFree(false), []);
  useHandsFree({ on: handsFree, supported: speech.sttSupported, listening: speech.listening, busy, speaking: speech.speaking, error: speech.error, start: speech.startListening, stop: speech.stopListening, turnOff: turnOffHandsFree });
  const toggleHandsFree = () => {
    if (handsFree) { setHandsFree(false); speech.stopListening(); return; }
    speech.setMuted(false);
    speech.clearError();
    setHandsFree(true);
  };

  useWakePhrase(wake && speech.sttSupported, speech.listening || busy || speech.speaking, (t) => { voiceTurn.current = true; void send(t); });
  useEffect(() => () => abort.current?.abort(), []);

  const ModeIcon = MODES.find((m) => m.id === mode)!.Icon;
  const modes = MODES.filter((m) => m.id !== "drive" || driveOn);

  // The home bar's sheet uses 44 px targets; the classic sheet keeps its compact chips.
  const chip = home && !compact ? "h-11 gap-1 rounded-full px-3 text-xs" : "h-7 gap-1 rounded-full px-2.5 text-xs";
  const controls = (
    <>
        <Button
          type="button"
          variant={handsFree ? "default" : "secondary"}
          size="sm"
          className={chip}
          aria-pressed={handsFree}
          disabled={!speech.sttSupported}
          title={speech.sttSupported ? undefined : "Voice input is not available in this browser"}
          onClick={toggleHandsFree}
        >
          <Headphones className="h-3.5 w-3.5" /> <span className={home && !compact ? "sr-only sm:not-sr-only" : undefined}>Hands-free</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className={chip} aria-label={`Trip mode: ${mode}`}>
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
            <Button variant="ghost" size="icon" className={home && !compact ? "h-11 w-11" : "h-8 w-8"} aria-label="Assistant settings"><MoreVertical className="h-4 w-4" /></Button>
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
                ? "Hold a conversation by voice: tap the mic, or turn on “Hey map”. Your location is sent only after you tap Use my location, and only for that question."
                : "Voice input is not available in this browser, so type instead. Answers can still be spoken."}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
    </>
  );

  const answers = (
    <>
        {messages.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Ask anything about getting around. For example:</p>
            {["How will my trip be tomorrow from here to Grand Central at 9am?", "Walk me from Union Square to Washington Square Park"].map((q) => (
              <Button key={q} variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void send(q)}>{q}</Button>
            ))}
          </div>
        ) : (
          messages.map((m) =>
            // In the home sheet the working panel stands in for the empty reply bubble.
            home && !compact && m.role === "assistant" && !m.content && !m.actions?.length && !m.offerLocation ? null : (
            <div key={m.id} className={cn("max-w-[90%] rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
              {m.content || (busy ? "…" : "")}
              {m.actions?.length ? <AnswerActions actions={m.actions} onRun={runAction} /> : null}
              {m.sources ? <AnswerSources line={m.sources} /> : null}
              {m.offerLocation && shared.status !== "on" ? (
                <Button type="button" size="sm" className="mt-2 h-8 w-full gap-1.5" disabled={shared.status === "asking"} onClick={() => void enableLocation()}>
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                  {shared.status === "asking" ? "Finding you…" : "Use my location"}
                </Button>
              ) : null}
            </div>
            ),
          )
        )}
        {home && !compact && busy ? <WorkingPanel steps={steps} /> : null}
        {trip ? (
          <div className="rounded-lg border p-3">
            <TripSummary trip={trip} mapTime={mapTime} onSelect={(alt) => chooseTrip(selectAlternative(trip, alt))} />
            <div className="mt-3 flex items-center gap-1.5">
              <Button size="sm" className="flex-1 gap-2" onClick={() => (player.state.playing && player.state.tripId === trip.id ? player.toggle() : startPreview(trip, prefSpeed))}>
                {player.state.playing && player.state.tripId === trip.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {player.state.tripId !== trip.id ? "Play trip preview" : player.state.playing ? "Pause preview" : player.state.status === "paused" ? "Resume preview" : "Play trip preview"}
              </Button>
              <SpeedPicker speed={prefSpeed} onSpeed={(s) => { setPrefSpeed(s); player.setSpeed(s); }} label="Preview speed" />
            </div>
          </div>
        ) : null}
    </>
  );

  const footer = (
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
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs" disabled={shared.status === "asking"} onClick={() => void enableLocation()}>
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> Use my location
            </Button>
          </>
        )}
      </div>
  );

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b py-3 pl-4 pr-12">
        <div className="flex-1 text-sm font-semibold">{compact ? "Ask about this spot" : "Ask the map"}</div>
        {controls}
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
        {answers}
      </div>

      {footer}
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

  const playback = player.state.active ? (
    <PlaybackBar
      playing={player.state.playing}
      speed={player.state.speed}
      callout={player.state.callout}
      step={`${player.state.seg + 1}/${player.state.segs.length}`}
      onToggle={player.toggle}
      onSpeed={(s) => { setPrefSpeed(s); player.setSpeed(s); }}
      onSkip={player.skip}
      onClose={player.stop}
    />
  ) : null;

  if (home) {
    const tapVoice = () => {
      if (!speech.sttSupported) { setNotice(VOICE_UNSUPPORTED); return; }
      if (busy) return;
      if (speech.listening) { speech.stopListening(); return; }
      setNotice(null);
      speech.clearError();
      speech.startListening();
    };
    return (
      <>
        <AgentHome
          input={input}
          setInput={setInput}
          onSend={(t) => void send(t)}
          busy={busy}
          voice={{ supported: speech.sttSupported, listening: speech.listening, interim: speech.interim, error: speech.error, start: speech.startListening, stop: speech.stopListening }}
          notice={notice ?? speech.error}
          onVoiceTap={tapVoice}
          sheetOpen={chatOpen}
          onCloseSheet={() => setChatOpen(false)}
          answers={answers}
          controls={controls}
          footer={<div className="pb-2">{footer}</div>}
          // On a phone the place sheet and the layers drawer own the bottom; an open answer stays.
          hidden={walking || streetViewOpen || player.state.active || (!isDesktop && !chatOpen && !busy && (drawerOpen || (panelContent !== null && !panelMinimized)))}
          lift={!isDesktop && panelContent !== null && panelMinimized}
        />
        {playback}
      </>
    );
  }

  return (
    <>
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side={isDesktop ? "left" : "bottom"} className={isDesktop ? "flex h-full w-full flex-col p-0 sm:max-w-[420px]" : "flex h-[85vh] flex-col p-0"}>
          <SheetTitle className="sr-only">Ask the map</SheetTitle>
          <SheetDescription className="sr-only">Voice and text trip assistant</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
      {/* On a phone the Ask sheet covers the bottom; the trip card's Play button stands in until it closes. */}
      {isDesktop || !chatOpen ? playback : null}
    </>
  );
}

/** 2x / 5x / 10x / 30x. A change keeps the camera where it is and changes the rate. */
function SpeedPicker({ speed, onSpeed, label }: { speed: Speed; onSpeed: (s: Speed) => void; label: string }) {
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      {PLAYBACK_SPEEDS.map((s) => (
        <Button key={s} type="button" size="sm" variant={speed === s ? "default" : "ghost"} className="h-8 rounded-full px-2 text-xs tabular-nums" aria-pressed={speed === s} onClick={() => onSpeed(s)}>
          {s}x
        </Button>
      ))}
    </div>
  );
}

/** The one slim preview bar: play/pause, speed, skip leg, close. No tooltips. */
function PlaybackBar(p: { playing: boolean; speed: Speed; callout: string; step: string; onToggle: () => void; onSpeed: (s: Speed) => void; onSkip: () => void; onClose: () => void }) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[70] flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-lg backdrop-blur-md" role="region" aria-label="Trip preview">
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={p.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
        {p.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <SpeedPicker speed={p.speed} onSpeed={p.onSpeed} label="Playback speed" />
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Skip to next leg" onClick={p.onSkip}><SkipForward className="h-4 w-4" /></Button>
      <div className="min-w-0 flex-1 truncate px-1 text-sm" aria-live="polite">{p.callout}</div>
      <Badge variant="secondary" className="tabular-nums">{p.step}</Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Close preview" onClick={p.onClose}><X className="h-4 w-4" /></Button>
    </div>
  );
}
