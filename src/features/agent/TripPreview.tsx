import "@/components/task-screens.css";
import { BellRing, Clock, MapPin, Pause, PartyPopper, Play, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/appLang";
import { plainAlertText } from "@/lib/transit/trouble";
import { remindAt, saveReminder } from "./reminder";
import { PLAYBACK_SPEEDS, type PlaybackSpeed, type Trip } from "./schema";
import type { PlayerState } from "./usePlayer";

/** The frame's preview controls; the existing player owns all playback state. */
export function TripPreview(p: {
  trip: Trip; state: PlayerState; speed: PlaybackSpeed;
  onToggle: () => void; onSpeed: (s: PlaybackSpeed) => void;
  onClose: () => void; onUse: () => void; onOther: () => void;
  /** Open the line a notice is about, e.g. "N" for "[N][R] trains are delayed". */
  onAlert?: (route: string) => void;
}) {
  const { trip, state } = p;
  const t = useT();
  const minutes = Math.max(1, Math.round((Date.parse(trip.arriveIso) - Date.parse(trip.departIso)) / 60000));
  const leave = new Date(trip.departIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const alert = trip.alerts[0];
  // The line the notice names; the one you ride when it names several.
  const named = alert ? [...alert.matchAll(/\[([A-Z0-9]{1,3})\]/g)].map((m) => m[1]) : [];
  const alertRoute = named.find((r) => trip.legs.some((l) => l.kind === "ride" && l.route === r)) ?? named[0];
  const w = trip.weather;
  const progress = state.status === "ended" ? 100 : state.segs.length ? state.seg / state.segs.length * 100 : 0;
  return <>
    <div className="task-top flex flex-col gap-2" data-testid="trip-heading">
      <div className="flex items-center gap-2">
        <div className="task-panel flex min-w-0 flex-1 items-center gap-2.5 rounded-[18px] px-3.5 py-2">
          <Clock className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0"><h2 className="text-[15px] font-semibold">{leave}</h2>
            <p className="text-[13px] text-slate-300">{trip.origin.label} → {trip.destination.label} · about {minutes} min</p></div>
        </div>
        <button type="button" className="task-action task-close" aria-label="Close trip" onClick={p.onClose}><X size={18} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {w ? <span className="task-panel rounded-full px-3 py-2 text-[13px]">{w.summary} · {Math.round(w.tempC)}°C / {Math.round(w.tempC * 9 / 5 + 32)}°F{w.precipPct >= 40 ? ` · ${w.precipPct}% rain` : ""}</span> : null}
        {alert ? <button type="button" disabled={!alertRoute || !p.onAlert} onClick={() => alertRoute && p.onAlert?.(alertRoute)}
          className="task-panel flex max-w-full items-center gap-1.5 rounded-full border-amber-500/40 px-3 py-2 text-left text-[13px] text-amber-200">
          <TriangleAlert size={14} className="shrink-0" aria-hidden /><span className="truncate">{plainAlertText(alert)}</span></button> : null}
      </div>
    </div>
    <section className="task-panel task-bottom flex flex-col gap-2.5" aria-label="Trip preview">
      <div className="flex items-center gap-2.5">
        <button type="button" className="task-action h-[52px] w-[52px] shrink-0 rounded-full p-0" aria-label={state.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
          {state.playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <div className="grid flex-1 grid-cols-4 gap-1 rounded-[14px] bg-slate-900/50 p-1" role="group" aria-label="Playback speed">
          {PLAYBACK_SPEEDS.map((s) => <button type="button" key={s} aria-pressed={s === p.speed} onClick={() => p.onSpeed(s)} className={`h-10 rounded-[10px] text-sm font-semibold ${s === p.speed ? "bg-slate-50 text-slate-900" : "text-slate-200"}`}>{s}×</button>)}
        </div>
      </div>
      <div role="progressbar" aria-label="Preview progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 overflow-hidden rounded bg-slate-400/25"><div className="h-full bg-amber-500" style={{ width: `${progress}%` }} /></div>
      {state.status === "ended" ? <div className="flex items-start gap-2.5" data-testid="trip-arrived" role="status">
        <PartyPopper size={22} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0"><p className="text-[15px] font-semibold">You've arrived at {trip.destination.label.split(",")[0]}</p>
          {state.where ? <p className="text-[13px] text-slate-300">{state.where}</p> : null}</div>
      </div> : <>
        {state.active ? <p className="text-[13px] text-slate-300" aria-live="polite">{state.callout}</p> : null}
        {state.where ? <p className="flex items-center gap-1.5 text-[13px] text-slate-200" data-testid="trip-where">
          <MapPin size={14} className="shrink-0" aria-hidden /><span className="truncate">{state.where}</span></p> : null}
      </>}
      {/* A trip planned for later: the answer says "tap Remind me", so the button is here too. */}
      {trip.scheduled?.future ? <button type="button" className="task-action task-secondary flex items-center justify-center gap-1.5" data-testid="preview-remind"
        onClick={() => { saveReminder(trip); toast(t("remindSaved").replace("{t}", remindAt(trip))); }}>
        <BellRing size={16} aria-hidden />{t("remindMe")}</button> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="task-action" onClick={p.onUse}>Use this route</button>
        <button type="button" className="task-action task-secondary" onClick={p.onOther}>{t("otherOptions")}</button>
      </div>
    </section>
    {state.status === "ended" ? <Balloons key={state.restart} /> : null}
  </>;
}

const BALLOONS = [
  { left: "12%", color: "#f59e0b", delay: 0 },
  { left: "30%", color: "#2563eb", delay: 0.35 },
  { left: "52%", color: "#ef4444", delay: 0.15 },
  { left: "70%", color: "#22c55e", delay: 0.5 },
  { left: "86%", color: "#a855f7", delay: 0.25 },
];

/** A short celebration on arrival; hidden for reduced motion by the stylesheet. */
function Balloons() {
  return <div className="arrive-balloons" aria-hidden data-testid="arrive-balloons">
    {BALLOONS.map((b) => <span key={b.left} className="arrive-balloon" style={{ left: b.left, background: b.color, animationDelay: `${b.delay}s` }} />)}
  </div>;
}
