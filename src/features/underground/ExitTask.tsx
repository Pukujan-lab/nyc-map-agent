import "@/components/task-screens.css";
import { ArrowUp, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { alongLabel } from "./cues";
import type { ExitPack } from "./pack";
import { signText } from "./cues";

/** Real saved exits, with a pointer only when the existing calibration trusts it. */
export function ExitTask(p: {
  pack: ExitPack; chosen: number; online: boolean;
  rotation: number | null; distanceM: number | null;
  onChoose: (i: number) => void; onOut: () => void; onClose: () => void;
  onCalibrate?: () => void;
}) {
  const [other, setOther] = useState(false);
  const exit = p.pack.exits[p.chosen];
  return <>
    <div className="task-top flex items-center gap-2">
      <div className="task-panel flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5">
        <h2 className="text-sm font-semibold">{p.pack.station.name}</h2>
        {!p.online ? <span className="ml-auto flex items-center gap-1 text-xs text-slate-300"><WifiOff size={14} />Offline</span> : null}
      </div>
      <button type="button" aria-label="Close underground help" className="task-action task-secondary h-11 w-11 shrink-0 p-0" onClick={p.onClose}><X size={18} /></button>
    </div>
    <section className="task-panel absolute left-3 top-[140px] z-40 flex max-h-[calc(100dvh-250px)] w-[min(460px,calc(100%-24px))] flex-col items-center gap-3.5 overflow-y-auto px-4 py-[18px] text-center" aria-label="Station exits">
      <span className="task-caption">Your exit</span>
      <h3 className="text-2xl font-bold leading-tight">{exit ? signText(exit.streets, exit.corner)?.replace(/^Exit · /, "") ?? `Exit ${p.chosen + 1}` : "No street exits listed"}</h3>
      {exit ? <>
        {p.rotation !== null ? <div className="flex h-[168px] w-[168px] shrink-0 items-center justify-center rounded-full border-2 border-slate-400/25" role="img" aria-label="Approximate direction to your exit"><ArrowUp className="h-24 w-24 text-blue-400" style={{ transform: `rotate(${p.rotation}deg)` }} /></div> : <div className="flex min-h-20 items-center justify-center text-sm text-slate-300">Follow the station’s exit signs{p.onCalibrate ? <button type="button" className="task-action task-secondary ml-2" onClick={p.onCalibrate}>Set pointer</button> : null}</div>}
        <p className="text-lg font-semibold">{alongLabel(exit.alongM) ?? (p.distanceM !== null ? `About ${p.distanceM} m from the station centre` : "Distance unavailable")}</p>
        <p className="text-[13px] text-amber-300">Approximate · stay behind the yellow line</p>
        <div className="grid w-full grid-cols-2 gap-2">
          <button type="button" className="task-action min-h-12" onClick={p.onOut}>I'm out</button>
          <button type="button" className="task-action task-secondary min-h-12" aria-expanded={other} onClick={() => setOther(!other)}>Other exits</button>
        </div>
      </> : <p className="text-sm text-slate-300">Follow the station signs.</p>}
      {other ? <div className="flex w-full flex-col gap-2" aria-label="Other exits">{p.pack.exits.map((e, i) => <button type="button" key={i} className="task-action task-secondary text-left" aria-pressed={i === p.chosen} onClick={() => { p.onChoose(i); setOther(false); }}>{signText(e.streets, e.corner) ?? `Exit ${i + 1}`}</button>)}</div> : null}
    </section>
  </>;
}
