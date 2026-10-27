import { useEffect, useState, type ReactNode } from "react";
import { BusFront, ChevronRight, TrainFront } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useFlags } from "@/lib/flags";
import { useMenuT } from "@/lib/i18n/menuText";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type PanelChip } from "@/lib/store/PanelContext";

const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const SWITCH = "data-[state=checked]:bg-[#2563eb] data-[state=unchecked]:bg-[#334155]";
const LAYER_ICON = "h-[22px] w-[22px] shrink-0";
const LAYER_ROW = "min-h-[52px] text-[15px]";

export function SwitchRow({ icon, label, on, onChange, disabled, testId, className }: { icon: ReactNode; label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; testId?: string; className?: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-2 text-[14px] font-medium ${disabled ? "opacity-50" : ""} ${className ?? ""}`} data-testid={testId}>
      {icon}
      <span className="flex-1">{label}</span>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} aria-label={label} className={SWITCH} />
    </label>
  );
}

export const RestroomIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <circle cx="7" cy="4" r="2" /><path d="M5 7h4l1 7H8.5v7h-3v-7H4l1-7Z" /><circle cx="17" cy="4" r="2" /><path d="M15.2 7h3.6l2.2 8h-2.5v6h-3v-6H13l2.2-8Z" />
  </svg>
);

/**
 * Under Live buses: which routes show, and a dropdown to change them, with the routes near
 * the map to tap and a box for any other (owner, 2026-10-27: no way to choose buses).
 */
function BusRoutePicker({ chip }: { chip: PanelChip }) {
  const [open, setOpen] = useState(false);
  const [near, setNear] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const { note, suggest, setRoutes } = chip;
  const routes = chip.routes ?? [];
  // The switch found nothing: open the choices so the next step is right there.
  useEffect(() => { if (note) setOpen(true); }, [note]);
  useEffect(() => {
    if (!open || !suggest) return;
    let live = true;
    setNear(null);
    suggest().then((r) => { if (live) setNear(r); }, () => { if (live) setNear([]); });
    return () => { live = false; };
  }, [open, suggest]);
  if (!setRoutes) return null;
  const toggle = (r: string) => setRoutes(routes.includes(r) ? routes.filter((x) => x !== r) : [...routes, r]);
  const options = [...new Set([...routes, ...(near ?? [])])];
  return (
    <div data-testid="bus-routes" className="pb-1 pl-[46px] pr-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`flex min-h-9 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[13px] text-[#cbd5e1] hover:bg-white/5 ${RING}`}>
        <span className="min-w-0 flex-1 truncate">{routes.length ? `Showing ${routes.join(", ")}` : "No routes chosen"}</span>
        <span className="font-semibold text-[#60a5fa]">{routes.length ? "Change" : "Choose"}</span>
        <ChevronRight className={`h-4 w-4 text-[#a5b4cb] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-2 pb-1 pt-1.5">
          {note ? <p role="status" className="text-[12px] text-[#fbbf24]">{note}</p> : null}
          {near === null && !options.length ? <p className="text-[12px] text-[#a5b4cb]">Looking for routes near the map…</p>
            : options.length ? (
              <div role="group" aria-label="Bus routes" className="flex flex-wrap gap-1.5">
                {options.map((r) => {
                  const on = routes.includes(r);
                  return (
                    <button key={r} type="button" aria-pressed={on} onClick={() => toggle(r)}
                      className={`h-8 min-w-[52px] rounded-full border px-3 text-[13px] font-semibold ${on ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#334155] bg-transparent text-[#f1f5f9] hover:bg-white/5"} ${RING}`}>
                      {r}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-[12px] text-[#a5b4cb]">No routes near the map. Type one below.</p>}
          <form className="flex gap-1.5" onSubmit={(e) => {
            e.preventDefault();
            const r = typed.trim().toUpperCase();
            if (r) { setRoutes([...routes.filter((x) => x !== r), r]); setTyped(""); }
          }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Add a bus route" placeholder="Add a route, like Q58"
              className={`h-9 min-w-0 flex-1 rounded-full border border-[#334155] bg-[rgba(15,23,42,0.9)] px-3 text-[13px] text-[#f1f5f9] placeholder:text-[#64748b] ${RING}`} />
            <button type="submit" className={`h-9 shrink-0 rounded-full bg-[#2563eb] px-3.5 text-[13px] font-semibold text-white ${RING}`}>Add</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Live trains, Live buses with its route chooser, and Restrooms: the Layers menu on wide screens, the Settings sheet on a phone. */
export function LiveLayerRows() {
  const { chips } = usePanel();
  const { restrooms, setRestrooms } = useMapState();
  const flags = useFlags();
  const trains = chips.find((c) => c.id === "liveTrains");
  const buses = chips.find((c) => c.id === "liveBuses");
  const t = useMenuT();
  return (
    <>
      {trains ? <SwitchRow className={LAYER_ROW} icon={<TrainFront className={LAYER_ICON} aria-hidden />} label={t("liveTrains")} on={trains.active} onChange={trains.onToggle} /> : null}
      {buses ? <SwitchRow className={LAYER_ROW} icon={<BusFront className={LAYER_ICON} aria-hidden />} label={t("liveBuses")} on={buses.active} onChange={buses.onToggle} /> : null}
      {buses ? <BusRoutePicker chip={buses} /> : null}
      {flags.restrooms ? <SwitchRow className={LAYER_ROW} icon={<RestroomIcon />} label={t("restrooms")} on={restrooms} onChange={() => setRestrooms(!restrooms)} /> : null}
    </>
  );
}
