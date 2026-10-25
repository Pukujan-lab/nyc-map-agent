import "@/components/task-screens.css";
import { ArrowUp, LocateFixed, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { alongLabel } from "./cues";
import type { ExitPack } from "./pack";
import { signText } from "./cues";
import { distanceLabel, type Where } from "./where";

/** Real saved exits, with a pointer only when the existing calibration trusts it. */
export function ExitTask(p: {
  pack: ExitPack; chosen: number; online: boolean;
  rotation: number | null; distanceM: number | null;
  onChoose: (i: number) => void; onOut: () => void; onClose: () => void;
  onCalibrate?: () => void;
  /** Whether you are at this station; without it the card just shows the exits. */
  where?: Where;
  onShare?: () => void; onHere?: () => void; onWalkThere?: () => void; onPickStation?: (id: string) => void;
}) {
  const [other, setOther] = useState(false);
  const exit = p.pack.exits[p.chosen];
  const w = p.where;
  const here = !w || w.kind === "here";
  const away = exit && w?.kind === "here" && w.toExitM !== null ? `About ${w.toExitM} m from you` : null;
  return <>
    <div className="task-top flex items-center gap-2">
      <div className="task-panel flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5">
        <h2 className="text-sm font-semibold">{p.pack.station.name}</h2>
        {!p.online ? <span className="ml-auto flex items-center gap-1 text-xs text-slate-300"><WifiOff size={14} />Offline</span> : null}
      </div>
      <button type="button" aria-label="Close underground help" className="task-action task-secondary h-11 w-11 shrink-0 p-0" onClick={p.onClose}><X size={18} /></button>
    </div>
    {/* A short strip under the station name: the map below shows you, the exit and the way there (owner, 2026-10-25). */}
    <section className="task-panel absolute left-3 top-[140px] z-40 flex max-h-[calc(100dvh-250px)] w-[min(420px,calc(100%-24px))] flex-col gap-2 overflow-y-auto rounded-2xl px-3 py-2.5" aria-label="Station exits">
      {w && w.kind !== "here" ? <WhereRow where={w} station={p.pack.station.name} onShare={p.onShare} onHere={p.onHere} onWalkThere={p.onWalkThere} onPickStation={p.onPickStation} /> : null}
      <div className="flex items-center gap-3">
        {exit && p.rotation !== null ? <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-400/25" role="img" aria-label="Approximate direction to your exit"><ArrowUp className="h-7 w-7 text-blue-400" style={{ transform: `rotate(${p.rotation}deg)` }} /></div> : null}
        <div className="min-w-0 flex-1">
          <span className="task-caption">Your exit</span>
          <h3 className="truncate text-base font-bold leading-tight">{exit ? signText(exit.streets, exit.corner)?.replace(/^Exit · /, "") ?? `Exit ${p.chosen + 1}` : "No street exits listed"}</h3>
          <p className="text-xs text-slate-300">{exit ? <>{away ?? alongLabel(exit.alongM) ?? (p.distanceM !== null ? `About ${p.distanceM} m from the station centre` : "Follow the exit signs")} · <span className="text-amber-300">approximate</span></> : "Follow the station signs."}</p>
        </div>
        {exit && here ? <button type="button" className="task-action min-h-10 shrink-0 px-3" onClick={p.onOut}>I'm out</button> : null}
      </div>
      {exit ? <div className="flex gap-2 text-xs">
        <button type="button" className="task-action task-secondary min-h-9 flex-1" aria-expanded={other} onClick={() => setOther(!other)}>Other exits</button>
        {p.rotation === null && p.onCalibrate ? <button type="button" className="task-action task-secondary min-h-9 flex-1" onClick={p.onCalibrate}>Set pointer</button> : null}
      </div> : null}
      {other ? <div className="flex w-full flex-col gap-1.5" aria-label="Other exits">{p.pack.exits.map((e, i) => <button type="button" key={i} className="task-action task-secondary min-h-9 text-left text-sm" aria-pressed={i === p.chosen} onClick={() => { p.onChoose(i); setOther(false); }}>{signText(e.streets, e.corner) ?? `Exit ${i + 1}`}</button>)}</div> : null}
    </section>
  </>;
}

/** "Are you at Flushing Av?", "Finding you…" or "You're 1.2 km from Flushing Av", with the one or two buttons that answer it. */
function WhereRow(p: { where: Exclude<Where, { kind: "here" }>; station: string; onShare?: () => void; onHere?: () => void; onWalkThere?: () => void; onPickStation?: (id: string) => void }) {
  const w = p.where;
  const btn = "task-action min-h-9 flex-1 px-3 text-xs";
  return <div className="flex flex-col gap-1.5 rounded-xl bg-[rgba(15,23,42,0.45)] px-2.5 py-2" role="status" data-testid="exit-where">
    {w.kind === "finding" ? <p className="flex items-center gap-1.5 text-sm"><LocateFixed size={14} aria-hidden />Finding you…</p>
      : w.kind === "ask" ? <>
        <p className="text-sm font-semibold">Are you at {p.station}?</p>
        <p className="text-xs text-slate-300">{w.blocked ? "Location is off for this site, so tell me." : "Share your location and I'll check, then show the way to your exit."}</p>
        <div className="flex gap-2">
          {!w.blocked && p.onShare ? <button type="button" className={btn} onClick={p.onShare}>Share location</button> : null}
          {p.onHere ? <button type="button" className={`${btn} task-secondary`} onClick={p.onHere}>I'm here</button> : null}
        </div>
      </>
      : <>
        <p className="text-sm font-semibold">You're about {distanceLabel(w.metres)} from {p.station}.</p>
        <div className="flex gap-2">
          {p.onWalkThere ? <button type="button" className={btn} onClick={p.onWalkThere}>Walk there</button> : null}
          {p.onHere ? <button type="button" className={`${btn} task-secondary`} onClick={p.onHere}>I'm here</button> : null}
        </div>
        {w.nearest && p.onPickStation ? <button type="button" className={`${btn} task-secondary w-full text-left`} onClick={() => p.onPickStation!(w.nearest!.id)}>Use {w.nearest.name}, by you</button> : null}
      </>}
  </div>;
}
