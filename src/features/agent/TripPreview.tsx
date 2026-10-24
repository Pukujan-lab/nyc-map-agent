import "@/components/task-screens.css";
import { Clock, Pause, Play, X } from "lucide-react";
import { PLAYBACK_SPEEDS, type PlaybackSpeed, type Trip } from "./schema";
import type { PlayerState } from "./usePlayer";

/** The frame's preview controls; the existing player owns all playback state. */
export function TripPreview(p: {
  trip: Trip; state: PlayerState; speed: PlaybackSpeed;
  onToggle: () => void; onSpeed: (s: PlaybackSpeed) => void;
  onClose: () => void; onUse: () => void; onOther: () => void;
}) {
  const { trip, state } = p;
  const minutes = Math.max(1, Math.round((Date.parse(trip.arriveIso) - Date.parse(trip.departIso)) / 60000));
  const progress = state.status === "ended" ? 100 : state.segs.length ? state.seg / state.segs.length * 100 : 0;
  return <>
    <div className="task-top flex flex-col gap-2" data-testid="trip-heading">
      <div className="flex items-center gap-2">
        <div className="task-panel flex min-w-0 flex-1 items-center gap-2.5 rounded-[18px] px-3.5 py-2">
          <Clock className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0"><h2 className="text-[15px] font-semibold">{trip.departIso.replace("T", " · ")}</h2>
            <p className="text-[13px] text-slate-300">{trip.origin.label} → {trip.destination.label} · about {minutes} min</p></div>
        </div>
        <button type="button" className="task-action task-secondary h-11 w-11 shrink-0 p-0" aria-label="Close trip" onClick={p.onClose}><X size={18} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        {trip.weather ? <span className="task-panel rounded-full px-3 py-2 text-[13px]">{trip.weather.summary} · {Math.round(trip.weather.tempC)}°C</span> : null}
        {trip.alerts.length ? <span className="task-panel max-w-full truncate rounded-full border-amber-500/40 px-3 py-2 text-[13px] text-amber-200">{trip.alerts[0]}</span> : null}
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
      {state.active ? <p className="text-[13px] text-slate-300" aria-live="polite">{state.callout}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="task-action" onClick={p.onUse}>Use this route</button>
        <button type="button" className="task-action task-secondary" onClick={p.onOther}>Other options</button>
      </div>
    </section>
  </>;
}
